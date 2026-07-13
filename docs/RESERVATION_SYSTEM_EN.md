# SVS Reservation System — Technical Reference

Next.js 14 + Supabase based alliance SVS (castle) reservation and assignment system.
Players **submit only their preferred time slots** during the application window, and R4+ admins run a **batch assignment after the deadline**.
The assignment algorithm uses **Min-Cost Max-Flow (MCMF)**.

> 한국어 버전: [RESERVATION_SYSTEM.md](RESERVATION_SYSTEM.md) · **Mobile HTML:** [RESERVATION_SYSTEM_EN.html](RESERVATION_SYSTEM_EN.html)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Environment Variables](#2-environment-variables)
3. [Operations Workflow](#3-operations-workflow)
   - [3.5 Operational Scenarios & Responses](#35-operational-scenarios--responses)
4. [Pages & URLs](#4-pages--urls)
5. [Data Model](#5-data-model)
6. [Time & Slot Structure](#6-time--slot-structure-utc)
7. [Player Application Flow](#7-player-application-flow)
8. [Batch Assignment Algorithm](#8-batch-assignment-algorithm)
9. [Post-Assignment Behavior](#9-post-assignment-behavior-cancellation--promotion)
10. [Admin Features](#10-admin-features)
11. [Public Status Page](#11-public-status-status)
12. [Cycles](#12-cycles)
13. [Settings Keys](#13-settings-keys)
14. [Security & Access Control](#14-security--access-control)
15. [Dev & Test Scripts](#15-dev--test-scripts)
16. [Source Files](#16-source-files)
17. [Google Form Integration](#17-google-form-integration-apps-script-pipeline)
18. [Changelog from Previous Version](#18-changelog-from-previous-version)

---

## 1. Overview

| Item | Description |
|------|-------------|
| Purpose | Fair assignment of Mon/Tue (VP) and Thu (MO) castle slots, prioritized by speedup |
| Application | Secret URL `/r/[token]` or Google Form — only **preferences** are saved to DB, no slot assignment |
| Assignment | Admin **Run full assignment** — recalculates entire cycle in Mon → Tue → Thu order |
| Algorithm | Min-Cost Max-Flow (MCMF) — resolves empty-slot-with-waitlist and speedup reversal bugs |
| Timezone | UTC only (no KST toggle) |
| Auth | Players: URL token / Admins: password via iron-session |

```mermaid
flowchart LR
  A["Player application\n/r/token or Google Form"] --> B[("preferences DB")]
  C["Booking deadline"] --> D["Speedup verification"]
  D --> E["Run full assignment"]
  E --> F[("reservations assigned")]
  F --> G["/status announcement"]
```

---

## 2. Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **server-only, never expose to client** |
| `IRON_SESSION_SECRET` | Admin session encryption key (32+ random characters) |
| `GOOGLE_FORM_WEBHOOK_SECRET` | Google Form webhook auth secret (same value as `X-Webhook-Secret`) |
| `NEXT_PUBLIC_BASE_URL` | (Optional) Public origin for Admin secret URL display |

```bash
# Generate session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Validate environment variables
npm run check-env
```

---

## 3. Operations Workflow

```mermaid
flowchart TD
  A["Application window\nPlayers submit via Google Form or /r/token"] --> B1["Google Form: stop accepting responses\n(Google Forms, not the website)"]
  B1 --> B2["Admin: Close secret URL\nreservation_open = false"]
  B2 --> C["Speedup verification\nCross-check actual values in reservation list"]
  C --> D["Run assignment\nAdmin: Run full assignment"]
  D --> E["Announce results\nShare /status link"]
```

| Step | Owner | Action | DB Change |
|------|-------|--------|-----------|
| Application window | Players | Submit day, speedup, preferred blocks via Google Form (primary) or `/r/[token]` | `players`, `preferences` |
| Close bookings (a) | R4+ | Stop accepting responses in **Google Forms** (cannot be controlled from the website) | — (Google side) |
| Close bookings (b) | R4+ Admin | Dashboard **Close secret URL** (opposite of `Open secret URL`) | `settings.reservation_open = false` |
| Speedup verification | R4+ Admin | Cross-check and edit actual speedup values in the reservation list / search / grid | `players` (if needed) |
| Run assignment | R4+ Admin | **Run full assignment** | `reservations` (assigned / eliminated), `last_assignment_run` |
| Announce results | R4+ | Share `/status` link | — (read only) |

> **Note:** During the application window, no `assigned` rows are created in `reservations`. An empty grid at this stage is expected.  
> **Closing bookings** is two separate actions: (a) stop Google Form responses and (b) **Close secret URL**. The dashboard button only controls the secret URL (`/r/...`).

### 3.5 Operational Scenarios & Responses

The tables below summarize **situation-specific responses** from production testing and code review. (Summary in [README](../README.md#운영-시나리오-요약))

#### Reservation Changes & Edits

| # | Timing | Application path | Player action | R4+ Admin action | DB change |
|---|--------|------------------|---------------|------------------|-----------|
| A | During application window · **needs to change answers** | `/r/[token]` or Google Form re-submit | **Re-submit with same Player ID** (full replace) | (Optional) Search → **Delete** if removal only | DELETE all `preferences` + INSERT new |
| B | After form close · **before Run full assignment** | `/r/[token]` (secret URL) | Contact R4 → re-submit while **Open secret URL** | (Optional) Search → **Delete** | Full `preferences` replace for cycle |
| B-2 | After B | `/r/[token]` | Re-submit via secret URL (only days in this submit remain) | — | Full `preferences` replace |
| C | **After assignment run** · re-submit | Google Form (always) / secret URL (**Open secret URL**) | **Re-submit** — DELETE existing `reservations`, full `preferences` replace | — | Same for assigned and eliminated |
| C-2 | **After assignment run** · **Close secret URL** | `/r/[token]` | **Rejected** when `reservation_open = false` | — | No DB change |
| D | **After assignment run** · R4 adjustment | — | Request cancellation from R4 | Schedule Grid **Cancel** | `cancelled` + day `preferences` deleted |
| E | After admin cancel/delete · **no re-apply** | — | Excluded from assignment that cycle/day | — | No preferences → not eligible |

> **Delete vs Cancel:** Delete appears in Search **only before assignment** (`last_assignment_run` unset). Cancel is per-slot on the Schedule Grid after assignment, with waitlist promotion. Both write a snapshot to `audit_log`.

#### Player Application

| # | Situation | Condition | Result | User message |
|---|-----------|-----------|--------|--------------|
| 1 | First valid submission | Google Form or secret URL (**Open secret URL**) | `submit_multi_day_reservation` RPC → `players` upsert + DELETE (player+cycle) + INSERT `preferences` | *Your application has been received.* |
| 2 | Re-submit same `player_id` | Existing `preferences` in cycle | Same RPC, full replace (+ `audit_log` `resubmit_preference` snapshot) | *Your application has been updated.* |
| 3 | **Close secret URL** | `reservation_open = false` (secret URL only) | Rejected | *Secret URL applications are currently closed.* |
| 3b | Google Form submit | Dashboard open/close **ignored** (`skipOpenCheck`) — accepted while Google Form still takes responses | Accepted if valid | *Your application has been received.* / *…updated.* |
| 4 | Re-submit after assignment | `last_assignment_run` set | Google Form: always allowed. Secret URL: only when **Open secret URL**. DELETE player `reservations` + full `preferences` replace (assigned·eliminated same) | *Your application has been updated.* |
| 5 | Empty day (no blocks) | speedup/blocks blank | Day skipped (not in submission) | — |
| 6 | Status check | `/r/[token]/check` | Before/after assignment | Application received / Assigned / On waitlist |

#### Admin Operational Phases

| Phase | `last_assignment_run` | Admin UI | Key actions |
|-------|-------------------------|----------|-------------|
| 1. Open window | unset | Secret URL, **Open secret URL** | Share `access_token` (plan B), `reservation_open = true` |
| 2. Collect applications | unset | Applicants, Search | Review applicants and speedups (primary: Google Form) |
| 3. Close | unset | (a) Stop Google Form responses + (b) **Close secret URL** | (a) Google side / (b) `reservation_open = false` |
| 4. Verify | unset | Search, Export | Cross-check actual speedup values |
| 5. Assign | unset → set | **Run full assignment** | MCMF batch: mon → tue → thu |
| 6. Announce | set | `/status` | Share status link |
| 7. Post-adjust | set | Grid Cancel, Waitlist, **Pending** | Cancel, promotion, review re-applies after assignment |
| 8. End cycle | — | Reset cycle (`RESET`) | Backup to `archived_*`, `cycle_id` +1 |

#### Post-Assignment Cancel & Promotion

| # | Situation | Admin action | Algorithm / DB |
|---|-----------|--------------|----------------|
| 1 | Cancel assigned slot | Grid **Cancel** | `status = cancelled`, delete day `preferences` |
| 2 | Waitlisted player available | (automatic) | `promoteOnCancel` → 1 `eliminated` → `assigned` |
| 3 | No waitlist | Cancel only | Slot stays empty (`healEliminated` / backfill) |
| 4 | Cancelled player re-applies | Google Form or `/r/[token]` (**Open secret URL**) | After Admin Cancel deletes day `preferences`, full-replace re-submit allowed |
| 5 | Re-run assignment | Run full assignment again | Deletes that day's assignments, full MCMF recalc |

#### Assignment Verification (`verify:assignment`)

| Code | Severity | Meaning | After MCMF |
|------|----------|---------|------------|
| V1 | Warning | Empty slot + waitlist simultaneously | **Target: 0** (occurred with Hopcroft-Karp) |
| V2 | Error | Duplicate assignment same day | Must always be 0 |
| V3 | Error | Assignment to inactive slot | Must always be 0 |
| V4 | Warning | Speedup reversal | **Target: 0** |
| V5 | Error | Assignment without preferences | Must always be 0 |

---

## 4. Pages & URLs

| Path | Access | Description |
|------|--------|-------------|
| `/r/[token]` | Matching secret token | Multi-step application form (info → Mon → Tue → Thu) |
| `/r/[token]/check` | Same token | Check application, assignment, and waitlist status by Player ID |
| `/status` | Public | Live schedule and waitlist (different text before/after assignment) |
| `/admin` | After login | Secret URL display · **Open/Close secret URL** · assign · search · grid · Pending · Reset (Google Form close is separate in Google Forms) |
| `/admin/guide` | After login | How to use (Admin / Player / **stack** tabs) |
| `/admin/login` | — | Password login |
| `/admin/setup` | One-time setup | Store admin password hash |

**API (admin session required)**

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/admin/login` | `{ password }` | Create session |
| POST | `/api/admin/action` | `{ action: "run_batch_assignment" }` | Same as button |
| GET | `/api/admin/assignment-preview` | — | Applicant count and last assignment time |

**API (webhook — no admin session)**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/google-form-submit` | `X-Webhook-Secret` header | Google Form payload → `submitMultiDayReservationRpc` (same RPC as secret URL) |

---

## 5. Data Model

### Table Structure

```mermaid
erDiagram
  players ||--o{ preferences : submits
  players ||--o{ reservations : has
  slots ||--o{ reservations : fills
  players ||--o{ archived_players : "archived on reset"

  players {
    integer player_id PK
    text name
    text alliance
    integer speedup_mon
    integer speedup_tue
    integer speedup_thu
  }
  preferences {
    integer player_id FK
    text day_of_week
    integer block_start_utc
    integer cycle_id
  }
  reservations {
    integer player_id FK
    integer slot_id FK
    text status
    integer cycle_id
  }
  slots {
    integer id PK
    text day
    integer block_start_utc
    integer slot_index
    boolean active
  }
```

### `reservations.status` Values

| status | slot_id | Meaning |
|--------|---------|---------|
| `assigned` | Slot ID | Assigned to a 30-minute slot |
| `eliminated` | `NULL` | No slot available for that day (waitlist) |
| `cancelled` | (original slot) | Admin cancelled — player's `preferences` deleted, re-application allowed |

### Archive Tables

Current cycle data is backed up before deletion when Reset cycle is executed.

| Table | Source |
|-------|--------|
| `archived_players` | `players` |
| `archived_preferences` | `preferences` |
| `archived_reservations` | `reservations` |

### `audit_log` (Audit Log)

Stores a **pre-change snapshot** on Admin delete/cancel and player re-submit. Not accessible via anon (service role only). Query from the Supabase table.

| action | When | snapshot | Other |
|--------|------|----------|-------|
| `delete_preference` | Admin Search → Delete per day (pre-assignment) | Deleted preferences rows | `actor_ip` |
| `cancel_reservation` | Schedule Grid → Cancel (post-assignment) | Cancelled reservation row | `actor_ip` |
| `resubmit_preference` | Re-submit when preferences already exist for the cycle | Preferences before replace | `source`: `secret_url` \| `google_form`, `was_locked`: whether re-submit was after assignment |

> Audit log write failures do **not** block submit / delete / cancel (errors go to console only).

---

## 6. Time & Slot Structure (UTC)

### Day & Role Mapping

| Day | Role | Speedup Field |
|-----|------|---------------|
| Monday | VP | `speedup_mon` |
| Tuesday | VP | `speedup_tue` |
| Thursday | MO | `speedup_thu` |

Wednesday, Friday, Saturday, and Sunday are not part of the system.

### Block & Slot Structure

```
One day (UTC)
├── Block 0  (00:00~02:00)  ── Slots 0~3 (30 min each)
├── Block 2  (02:00~04:00)  ── Slots 0~3
├── ...
└── Block 22 (22:00~24:00)  ── Slots 0~3

Total: 12 blocks × 4 slots = 48 slots / day
```

---

## 7. Player Application Flow

### Application Steps

```mermaid
flowchart LR
  A["Your info\nPlayer ID / Name / Alliance"] --> B["Monday\nSpeedup + preferred blocks"]
  B --> C["Tuesday\nSpeedup + preferred blocks"]
  C --> D["Thursday\nSpeedup + preferred blocks"]
  D --> E["Submit\nConfirmation dialog"]
  E --> F[("preferences DELETE+INSERT\nno reservations")]
```

### Server-Side Rules

**Common:** Both Google Form and secret URL call `submitMultiDayReservationRpc` → Postgres RPC `submit_multi_day_reservation`.  
(Google Form: `app/api/google-form-submit/route.ts` → secret URL: `app/r/[token]/actions.ts`)  
The script wrapper `processMultiDayReservation` also delegates to the same RPC.

On success, within one transaction: `players` upsert + DELETE all `preferences` for that `player_id`+`cycle_id`, then INSERT.  
On re-submit, an `audit_log` `resubmit_preference` snapshot is written **before** the RPC call.

| Path | `reservation_open` check | When `last_assignment_run` is set |
|------|--------------------------|-----------------------------------|
| **Google Form** | **Not checked** (`skipOpenCheck: true`) | RPC DELETEs that player's `reservations`, then full `preferences` replace (assigned·eliminated same) |
| **Secret URL** | Pre-checked in `actions.ts` — **rejected** if `false` (`SECRET_URL_CLOSED_MESSAGE`) | Same as Google Form when `reservation_open = true` (RPC called with `skipOpenCheck: true`) |

| Situation | User message |
|-----------|--------------|
| First submit | *Your application has been received.* |
| Re-submit (before or after assignment) | *Your application has been updated.* |
| Secret URL closed | *Secret URL applications are currently closed.* |

> Re-submitting keeps **only the days included in this submission**. Example: if you first applied for Mon+Tue then re-submit Tue only, Mon preferences are removed.  
> **After assignment**, re-submitting deletes existing `assigned` and `eliminated` rows first, so assignment results may disappear from `/status` and the check page until assignment is run again.  
> The check page (`/r/[token]/check`) pending text still uses *"Your application has been received. Assignment results will be announced after the booking window closes."* (`SUBMIT_SUCCESS_MESSAGE`)

### Full Replace on Re-Submit

Re-submitting with the same `player_id` + `cycle_id` **DELETEs all** `preferences` for that cycle, then INSERTs the new submission. After `last_assignment_run` is set, that player's `reservations` are also DELETEd first. Different `player_id` values are independent.

### Self-Check (`/r/[token]/check`)

| Timing | Status Displayed |
|--------|-----------------|
| Before assignment | **Application received** |
| After assignment — slot found | **Assigned** + time |
| After assignment — no slot | **On waitlist** + preferred blocks |

---

## 8. Batch Assignment Algorithm

Entry point: `runBatchAssignmentForCycle` → per-day `runBatchAssignment` (order: **mon → tue → thu**)

### Processing Flow

```mermaid
flowchart TD
  P["Load preferences"] --> E["Compute Top-N eligibility per block\ncomputeEligibleByBlock"]
  E --> G["Build MCMF network graph"]
  G --> H["Run SPFA-based MCMF"]
  H --> A["Insert assigned"]
  H --> W["Insert eliminated"]
  A --> Z["Update last_assignment_run"]
  W --> Z
```

### Block-Level Eligibility (Top-N)

For each 2-hour block, applicants who listed that block as a preference are sorted by:

1. Speedup descending
2. Application time (`appliedAt`) ascending
3. `player_id` ascending (tiebreaker)

Only the top N are eligible (N = number of active slots in that block, max 4). A single player cannot occupy Top-N seats in multiple blocks simultaneously.

### MCMF Network Model

```
Source
  └── Player node (capacity: 1, cost: 0)
        ├── Top-N eligible slot node (capacity: 1, cost: R)
        └── Top-N ineligible slot node (capacity: 1, cost: R + 1,000,000)
              └── Sink (capacity: 1, cost: 0)

R = player's global speedup rank (1st = 1, 2nd = 2, ...)
```

- Algorithm: MCMF using SPFA (Shortest Path Faster Algorithm)
- Goal: Maximize total assignments (Max Flow) while prioritizing higher speedup players (Min Cost)

> **Why MCMF replaced Hopcroft-Karp:** The previous 2-phase Hopcroft-Karp approach had two known bugs — empty slots coexisting with waitlisted players (V1), and lower-speedup players receiving better slots than higher-speedup ones (V4). MCMF encodes priority directly into the cost function and resolves both in a single pass.

**Re-run behavior:** Running assignment again on the same cycle deletes and fully recalculates that day's assignments.

---

## 9. Post-Assignment Behavior (Cancellation & Promotion) and Pre-Assignment Deletion

### Pre-Assignment: Delete Application per Day

```mermaid
flowchart LR
  A["Admin: Search → Delete mon/tue/thu button"] --> B["Delete preferences for that day"]
  B --> C["Refresh search results"]
```

- **Visibility:** Delete buttons appear in search results only when `last_assignment_run` is not set (pre-assignment)
- Buttons are automatically hidden after assignment is run
- `players` table is not affected — only `preferences` are deleted
- Before delete, writes a `delete_preference` snapshot to `audit_log`
- Server action: `deletePreferenceByDay(player_id, day_of_week, cycle_id)`
- Confirmation dialog → loading spinner → completion toast notification

### Post-Assignment: Admin Slot Cancellation

```mermaid
flowchart LR
  A["Admin: Cancel button"] --> B["reservations.status = cancelled"]
  B --> C["Delete preferences for that day"]
  C --> D["Run promoteOnCancel"]
  D --> E{"Waitlisted player?"}
  E -->|Yes| F["Promote 1 eliminated → assigned"]
  E -->|No| G["Slot remains empty"]
  F --> H["healEliminatedReservations\nbackfillEmptySlotsForDay"]
```

- Before cancel, writes a `cancel_reservation` snapshot to `audit_log`
- The cancelled player can re-apply
- Admin UI shows a completion toast notification

### Waitlist Promotion (`promoteOnCancel`)

From `eliminated` players who preferred that block and are unassigned for that day, the same Top-N eligibility criteria are applied to promote 1 player to `assigned`.

---

## 10. Admin Features

Login: bcrypt hash (`settings.admin_password_hash`) + iron-session cookie

| Feature | Description |
|---------|-------------|
| Secret URL | Show, copy, or regenerate `access_token` (regenerating invalidates existing `/r/...` links) |
| Open / Close secret URL | Toggle `reservation_open` — controls **secret URL (`/r/...`) only** (independent of Google Form) |
| Export Excel | Per-cycle sheets (by day, etc.) |
| **Run full assignment** | `runFullBatchAssignment` — yellow panel above Search Reservations |
| Reset cycle | Type `RESET` → `archive_and_reset_cycle` RPC archives then deletes; increments `current_cycle_id` |
| Search | Before assignment: search applicants (with per-day Delete buttons) / After: search reservations and waitlist |
| Delete application per day | Before assignment only — delete a player's specific day `preferences` from search results → `audit_log` |
| Applicants | Before assignment only — applicant list from `preferences` |
| **Pending** | After assignment only — applicants with no `reservations` after last assignment (re-submit or new; included in next Run full assignment) |
| Schedule Grid | After assignment only — UTC grid with per-slot Cancel → `audit_log` |
| Waitlist | After assignment only — `eliminated` for that day + preferred blocks (one row per player via `dedupeEliminatedByPlayer`) |
| How to use | `/admin/guide` — Admin / Player / stack tabs |

---

## 11. Public Status (/status)

- Anonymous (anon) read access + Supabase Realtime subscription on `reservations`
- No `last_assignment_run` → shows "assignment not yet published", empty grid
- After assignment → displays `assigned` slots + Waitlist (VP/MO) — eliminated rows deduped to one per player
- Closed banner: `reservation_open === false` → *Secret URL applications closed*

---

## 12. Cycles

- `settings.current_cycle_id` (integer, default 1)
- All `preferences` / `reservations` are scoped by `cycle_id`
- **Reset cycle** backs up data to `archived_*` tables before deletion, then increments the ID

---

## 13. Settings Keys

| Key | Purpose |
|-----|---------|
| `access_token` | Secret string for `/r/[token]` |
| `admin_password_hash` | Admin bcrypt hash |
| `current_cycle_id` | Current cycle number |
| `reservation_open` | `"true"` / `"false"` |
| `last_assignment_run` | ISO timestamp of last batch assignment |

---

## 14. Security & Access Control

| Layer | Detail |
|-------|--------|
| RLS | anon can SELECT only (`players`, `slots`, `reservations`, `preferences`, `reservation_open`) — `audit_log` is service role only |
| Writes | Server Actions / API use service role (`createServiceClient`); applications go through `submit_multi_day_reservation` RPC |
| Admin | `requireAdmin()` fails without a valid session |
| Token URL | Token validated in both middleware and server |
| Webhook | `GOOGLE_FORM_WEBHOOK_SECRET` + timing-safe compare |

`SUPABASE_SERVICE_ROLE_KEY` in `.env.local` is server-only — never expose to the client.

---

## 15. Dev & Test Scripts

**Development**

| npm script | Description |
|------------|-------------|
| `inject:random -- N` | Inject N random applications (default 120, preferences only) |
| `inject:test` | Inject real test data |
| `clear:assignments` | Delete only current cycle's assignment results |
| `seed:stress` | clear + inject 120 random players |

**Assignment & Verification**

| npm script | Description |
|------------|-------------|
| `run:batch` | Run batch assignment (same as Admin button) |
| `verify:assignment` | Verify assignment results (V1~V5) — exits with code 1 on error |
| `audit:reservations` | Full cycle audit |
| `validate:assignment` | Assignment validity check |

**Maintenance**

| npm script | Description |
|------------|-------------|
| `recover:waitlist` | Recover waitlist |
| `backfill:slots` | Backfill empty slots |
| `reconcile:waitlist` | Fix eliminated consistency |
| `purge:orphans` | Delete players with no preferences |

### `verify:assignment` Checks

| Code | Severity | Check |
|------|----------|-------|
| V1 | Warning | Empty slot with waitlisted player simultaneously |
| V2 | Error | Same player assigned to the same day twice |
| V3 | Error | Assignment to an inactive slot |
| V4 | Warning | Speedup reversal (lower rank gets better slot) |
| V5 | Error | Assignment without corresponding preferences |

Exits with `process.exit(1)` if any error is found.

<details>
<summary>Local assignment test flow</summary>

```bash
npm run inject:random -- 10
npm run run:batch
npm run verify:assignment
```

</details>

---

## 16. Source Files

| Area | File |
|------|------|
| Submit RPC wrapper, assignment & MCMF | `lib/assignment.ts` (`submitMultiDayReservationRpc` / `processMultiDayReservation`) |
| Re-submit audit log | `lib/audit-log.ts` |
| Re-submit, messages & eliminated dedupe | `lib/reservation-guard.ts` |
| Day & block constants | `lib/types.ts` |
| UTC formatting | `lib/utils.ts` |
| Google Form webhook | `app/api/google-form-submit/route.ts` |
| Admin UI | `app/admin/AdminDashboard.tsx`, `app/admin/actions.ts` |
| How to use | `app/admin/guide/`, `docs/RESERVATION_SYSTEM.md`, `docs/ADMIN_GUIDE_QUICKSTART_EN.md` |
| Application & check | `app/r/[token]/ReservationForm.tsx`, `app/r/[token]/actions.ts` |
| Public status | `app/status/StatusView.tsx`, `app/status/page.tsx` |
| Assignment verification | `scripts/verify/verify-assignment.ts` |
| Audit & validation | `scripts/verify/audit-reservations.ts`, `scripts/verify/validate-assignment.ts` |
| Maintenance | `scripts/maintenance/` |
| Dev tools | `scripts/dev/` |
| Admin scripts | `scripts/admin/` |
| Apps Script | `scripts/appscript/onFormSubmit.gs` |
| Schema & RPC | `supabase/schema.sql` (`submit_multi_day_reservation`, `archive_and_reset_cycle`) |
| Migrations | `supabase/migrations/` (`v9_audit_log`, `v10_audit_log_resubmit`, etc.) |

---

## 17. Google Form Integration (Apps Script Pipeline)

A Google Form submission path runs in parallel to work around Vercel cold starts and improve accessibility.

### Architecture

```mermaid
flowchart LR
  GF["Google Form submission"] --> AS["Apps Script\nonFormSubmit"]
  AS --> WH["POST /api/google-form-submit"]
  WH --> RPC["submit_multi_day_reservation\n(Postgres RPC)"]
  RL["Secret link /r/token"] --> SA["submitReservation\nServer Action"]
  SA --> RPC
  RPC --> SB[("Supabase\nplayers / preferences")]
  SB --> BA["Assignment algorithm"]
```

Both paths go through the `submit_multi_day_reservation` RPC into the same `players` / `preferences` tables. Apps Script does not call Supabase directly. On re-submit, the API / Server Action writes an `audit_log` snapshot before the RPC.

### Form description (copy-paste)

Paste into the Google Form description. Written for **email collection ON** (an email column appears in the sheet). DB updates happen via **form re-submit** or the **secret link** (editing a response alone may not re-fire the webhook).

**English**

> Resubmitting with the same Player ID **replaces your entire application** for this cycle with your latest submission.  
> Monday, Tuesday, and Thursday can each be applied for separately. **Days not included in this submission are removed** from your preferences.  
> If you play multiple characters, **submit the form once per Player ID**.  
> To change your application, **submit the form again** with the same Player ID, use the **secret link**, or contact ops (r4). After assignment runs, resubmitting **deletes your existing assignment** and replaces your preferences — contact r4 if you need to keep a slot or need an ops adjustment.

**한글**

> 같은 Player ID로 **다시 제출하면 이번 제출 내용으로 신청 전체가 교체**됩니다 (해당 사이클).  
> 월·화·목은 각각 별도로 신청할 수 있습니다. **이번 제출에 넣지 않은 요일은 preferences에서 제거**됩니다.  
> 여러 캐릭터를 운영하는 경우 **Player ID마다 폼을 따로 제출**하세요.  
> 내용 변경은 **같은 Player ID로 폼을 다시 제출**하거나 **시크릿 링크**로 재제출하세요. 배정 실행 후 재제출하면 **기존 배정이 삭제**되고 신청 내용이 교체됩니다 — 슬롯 유지·운영진 조정이 필요하면 r4에게 문의하세요.

**Behavior summary**

| Situation | Result |
|-----------|--------|
| Same Player ID re-submit (same cycle) | **Latest submission only** in DB (full DELETE + INSERT) |
| Same Player ID, different days (Mon/Tue/Thu) | Multiple days in one submission |
| **Different Player IDs** (same Google account) | **Each counted** — submit once per Player ID |
| After Google Form submit — need to change | **Re-submit form** or secret link (editing a response alone may not update DB) |
| Same Player ID via Form and secret link | **Latest submission overwrites** previous |
| Re-submit after assignment (`last_assignment_run`) | DELETE `reservations` + full `preferences` replace (Google Form always / secret URL when `reservation_open = true`) + `audit_log` |
| Secret URL closed (`reservation_open = false`) | Secret URL rejected — Google Form still accepts |

### Google Form Fields

Current Apps Script (`onFormSubmit.gs`) assumes sheet column layout with **email collection ON**.

| row index | Field | Type |
|-----------|-------|------|
| `row[0]` | Timestamp | Auto |
| `row[1]` | Email address | Auto (email collection ON) |
| `row[2]` | Player ID | Short answer — integer validation |
| `row[3]` | Player Name | Short answer |
| `row[4]` | Alliance | Short answer |
| `row[5]` | Monday Speedups (days) | Short answer — integer validation |
| `row[6]` | Preferred time on Monday | Checkboxes |
| `row[7]` | Tuesday Speedups (days) | Short answer — integer validation |
| `row[8]` | Preferred time on Tuesday | Checkboxes |
| `row[9]` | Thursday Speedups (days) | Short answer — integer validation |
| `row[10]` | Preferred time on Thursday | Checkboxes |

Checkbox block options (same for all three days):

```
0  (00:00~02:00 UTC)      12 (12:00~14:00 UTC)
2  (02:00~04:00 UTC)      14 (14:00~16:00 UTC)
4  (04:00~06:00 UTC)      16 (16:00~18:00 UTC)
6  (06:00~08:00 UTC)      18 (18:00~20:00 UTC)
8  (08:00~10:00 UTC)      20 (20:00~22:00 UTC)
10 (10:00~12:00 UTC)      22 (22:00~24:00 UTC)
```

### Form Setup

1. Create a new form at [Google Forms](https://forms.google.com)
2. Form settings (gear icon) → **Responses** tab:
   - Collect email addresses: **On** — email lands in sheet `row[1]`, matching current `onFormSubmit.gs` indices (email is **not** included in the webhook payload)
   - Limit to 1 response: **Off** (one person may submit **multiple Player IDs**)
   - Allow response editing: OK to enable — however **editing a response alone may not update the DB**. Prefer **form re-submit** or the secret link for changes
3. After building the form: Responses tab → spreadsheet icon → **Create new spreadsheet**
4. Submit a test response and confirm `row[2]` in the sheet is Player ID (must match `onFormSubmit.gs` indices)

### Apps Script Setup

1. Open the linked Google Sheet → **Extensions → Apps Script**
2. Delete all existing code and paste the contents of [`scripts/appscript/onFormSubmit.gs`](../scripts/appscript/onFormSubmit.gs)
3. Add `GOOGLE_FORM_WEBHOOK_SECRET` (a long random string) to Vercel env vars and redeploy
4. **Project Settings → Script properties** (not in source code):
   - `WEBHOOK_SECRET` = same value as Vercel `GOOGLE_FORM_WEBHOOK_SECRET`
   - (optional) `WEBHOOK_URL` = `https://wos1234.vercel.app/api/google-form-submit` — only if different from default
5. Run `testWebhookConnection` in the editor → expect `OK — webhook reachable`
6. Set up the trigger:
   - Left menu clock icon (Triggers) → **Add trigger**
   - Function to run: `onFormSubmit`
   - Event source: **From spreadsheet**
   - Event type: **On form submit**
7. Submit a test response and confirm data appears in Supabase `players` and `preferences` tables

> **Why not put Supabase keys in Apps Script?**  
> Supabase `sb_secret_` keys reject Google Apps Script's User-Agent (`Mozilla/5.0 (compatible; Google-Apps-Script)`) with 401. Apps Script cannot override User-Agent, so the Vercel API calls Supabase server-side instead.

### Full Replace Behavior

| Path | `reservation_open` | After assignment (`last_assignment_run`) |
|------|-------------------|------------------------------------------|
| Google Form | **Not checked** (`skipOpenCheck`) | DELETE player `reservations` + full `preferences` replace |
| Secret link | Rejected if `false` | Same as Google Form when `true` |

Re-submitting with the same `player_id` via **either path** keeps **only the latest submission**.  
**Different days** (Mon/Tue/Thu) can be included in one submission. **Different Player IDs** may each submit via the same Google account.  
DB updates happen via **form re-submit** (new response → webhook) or **secret link** re-submit. Google Form re-submit remains allowed after assignment; existing assignment and waitlist rows are deleted before preferences are replaced.

### Security Notes

- Keep `WEBHOOK_SECRET` only in Apps Script script properties — **never share it on GitHub, chat, or anywhere else.** If leaked, rotate `GOOGLE_FORM_WEBHOOK_SECRET` on Vercel.
- Keep the Supabase `service_role` key **only in Vercel env vars**, not in Apps Script.

---

## 18. Changelog from Previous Version

| Item | Previous | Current |
|------|----------|---------|
| On application | Immediately assigned via `assignToBlock` | Only `preferences` saved |
| Assignment timing | Real-time on each submission | Admin **Run full assignment** batch |
| Waitlist creation | `eliminated` created immediately | Created after batch assignment with `slot_id = null` |
| Algorithm | Hopcroft-Karp | Min-Cost Max-Flow (MCMF) |
| Speedup fields | `speedup_vp`, `speedup_mo` | `speedup_mon`, `speedup_tue`, `speedup_thu` |
| Re-submit behavior | (legacy) one per day, duplicate rejected | Full DELETE + INSERT per `player_id + cycle_id` |
| Submit handler | `processReservation` (per-day upsert) | `submit_multi_day_reservation` RPC (`submitMultiDayReservationRpc` / `processMultiDayReservation` wrappers) |
| Reset behavior | Data permanently deleted | `archive_and_reset_cycle` RPC + backup to `archived_*` then delete |
| Application paths | Secret link only | Secret link + Google Form |
| Time display | UTC/KST toggle | UTC only |
| Cancel button | Instant cancel | Loading spinner + completion toast + `audit_log` |
| Pre-assignment deletion | Not available | Delete per-day `preferences` from search results (pre-assignment only, `audit_log`) |
| Re-apply after assignment | — | Shown in Pending panel; included in next Run full assignment |
| Google Form sheet | (legacy) no email / Player ID=`row[1]` | Email collection ON — Player ID=`row[2]` |

---

*Document based on: `main` branch (MCMF assignment + UTC-only UI + Google Form pipeline + RPC submit + audit_log)*
