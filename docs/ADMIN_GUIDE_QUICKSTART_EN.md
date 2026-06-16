# Admin Quick Reference

For R4+ admins with access to this site. Explains how the reservation system works and how to run each cycle on the dashboard.

## How the system works

| Phase | What happens |
|-------|----------------|
| Application window | Members submit **preferences only** (day, speedup, preferred UTC blocks). No slot assignment yet. |
| After deadline | You close reservations, verify speedups, then **Run full assignment**. |
| After assignment | Results appear on **`/status`**. Members can check their own status via the secret link. |

**Application channels**

| Channel | When to use |
|---------|-------------|
| **Google Form** | Main path during the normal application window (email collection **off** — no post-submit edit link; **re-submit form** to update) |
| **Secret link** (`/r/...`) | Corrections during the window, late cases after form closes — share from dashboard when needed |

**Re-submit rule (both channels):** same **Player ID + cycle** → **full replace** (DELETE all preferences for that player in the cycle, then INSERT the new submission). Latest submission wins. **After assignment runs**, preference changes are **rejected**.

```mermaid
flowchart TD
  A[Open Google Form window] --> B[Members submit preferences]
  B --> C[Close reservations on dashboard]
  C --> D[Verify speedups in Search / Export]
  D --> E[Run full assignment]
  E --> F[Share /status link]
```

## Dashboard workflow (each cycle)

| Step | Action on `/admin` |
|------|---------------------|
| 1 | Confirm **reservations open**; distribute the Google Form link |
| 2 | When the window ends → **Close reservations** |
| 3 | **Search** or **Export Excel** — cross-check speedup values; edit if needed |
| 4 | **Run full assignment** (yellow panel) |
| 5 | Share **`/status`** with the alliance |
| 6 | After assignment: use **Schedule Grid** for slot cancellations; **Waitlist** to review eliminated players |

> Before assignment, the schedule grid is expected to be empty — only `preferences` exist until you run assignment.

## Handling member changes

| # | Timing | Member | R4 action |
|---|--------|--------|-----------|
| A | During application window · needs to change | **Re-submit** via Google Form (same Player ID) or **secret link** | (Optional) Search → **Delete** if removal only |
| B | After form close · before assignment | Contact R4 → **re-submit via secret link** | (Optional) Search → **Delete** |
| C | After assignment | Request change from R4 (case by case — may affect others) | Schedule Grid **Cancel** — **no self re-apply** |

Full scenario tables: **Technical Reference → §3.5 Operational Scenarios** below.

## Site pages (this deployment)

| Path | Who | Purpose |
|------|-----|---------|
| `/admin` | R4+ | Dashboard — open/close, assign, search, grid |
| `/admin/guide` | R4+ | This page |
| `/status` | Public | Live schedule and waitlist after assignment |
| `/r/[token]` | Members (late/special) | Application form |
| `/r/[token]/check` | Members | Check application / assignment by Player ID |

## Warnings

- **Do not press Reset cycle** during an active booking period unless you intentionally want to archive and wipe the entire cycle’s data and start a new cycle number.
- Regenerating the **secret URL** on the dashboard invalidates all existing `/r/...` links immediately.

---

# Player Quick Reference

How members apply and what they experience — useful when answering questions or handling change requests.

## Before they apply

- **Player ID**, **Player Name**, and **alliance** (NWO / BOS / MAR / SXY).
- All times are **UTC** (not KST).
- Submitting saves **preferences only**; slots are assigned after the booking window closes.

## How to apply

**Google Form** (main, during the application window)

Paste this in the form description (see [RESERVATION_SYSTEM.md §17](RESERVATION_SYSTEM.md#폼-상단-안내-문구-복사용) for full text):

> Resubmitting with the same Player ID **replaces your entire application** for this cycle with your latest submission. Monday, Tuesday, and Thursday can each be applied for separately. If you play multiple characters, **submit the form once per Player ID**. You cannot edit a Google Form response after submit — submit the form again with the same Player ID, use the **secret link**, or contact ops (r4). After assignment runs, changes are locked — contact r4.

1. Enter Player ID, Player Name, and alliance.
2. For each day (**Monday VP**, **Tuesday VP**, **Thursday MO**): speedup (days) + one or more UTC blocks.
3. Submit.

- **Cannot edit** the form after submit (email collection is off). To fix a mistake: **submit the form again** with the same Player ID, or use the **secret link** (before assignment).

**Secret link** (`/r/...`) — when R4 provides it

- Corrections during the application window.
- Late or special cases after the form closes.
- Re-submitting **replaces** your entire application for the cycle (only days in this submit remain).

## Rules members should know

| Rule | Detail |
|------|--------|
| Re-submit | Same **Player ID** in the current cycle → **latest submission replaces** the previous one (Mon / Tue / Thu can be combined in one submit) |
| Days omitted | Days **not** included in a re-submit are **removed** from preferences |
| No form edit after submit | Google Form has no edit link — re-submit form or use secret link |
| Google account vs Player ID | **Limit to 1 response: Off** — same Google account can submit **multiple times** for **different Player IDs** |
| Deadline | Rejected after R4 closes reservations |
| Both channels | Form and secret link both **full replace** — latest wins |
| After assignment | Self-service changes **rejected** — contact R4 |

## Check status

| When | Where | What they see |
|------|-------|---------------|
| Anytime | `/r/.../check` | Application / assigned / waitlist by Player ID |
| After assignment | `/status` | Public schedule (no login) |

| Status | Meaning |
|--------|---------|
| Application received | Saved; assignment not run yet |
| Assigned | Slot confirmed with time |
| On waitlist | No slot; preferred blocks listed |

## Member change requests

| Situation | Member action |
|-----------|---------------|
| During application window · wrong answers | **Re-submit** Google Form (same Player ID) or **secret link** |
| After form close, before assignment | Contact R4 → **secret link** re-submit |
| After assignment | Contact R4 — changes depend on situation; **cannot self re-apply** |

---
