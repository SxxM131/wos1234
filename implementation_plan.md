# Implementation Plan - Fixing Multi-Day Reservation Waitlist Bug

## Problem & Diagnosis

### The Issue
The user reported that `테스터_52` was waitlisted (eliminated) for Thursday (`MO` block `04:00~06:00 UTC`), even though all 4 slots in that Thursday block were completely empty and available.

### Root Cause Analysis
During a thorough database and code analysis, we uncovered a **major cascading reassignment bug** in [assignment.ts](file:///Users/sxxm/Documents/GitHub/wos1234/lib/assignment.ts) within the `assignToBlock` function.

When a player (e.g., `테스터_52`) submits a multi-day reservation:
1. They get successfully assigned to **Monday** (`VP` block 18).
2. They fail to get assigned to **Tuesday** (because their preferred Tuesday blocks are full).
3. They get successfully assigned to **Thursday** (`MO` block 4).
4. After their own submission, their database state is:
   - Monday: `assigned`
   - Tuesday: `eliminated`
   - Thursday: `assigned`

However, if a **subsequent player** submits a reservation on **Monday** with a higher speedup and displaces `테스터_52` from Monday:
- `assignToBlock` is called for Monday.
- `테스터_52` is demoted.
- The following update query is executed to transition the demoted player to `eliminated`:
  ```typescript
  await supabase
    .from("reservations")
    .update({ status: "eliminated", slot_id: null })
    .eq("player_id", d.playerId)
    .eq("cycle_id", cycleId)
    .eq("status", "assigned");
  ```
- **The Bug:** This update query filters **only** by `player_id`, `cycle_id`, and `status = 'assigned'`. It **does not limit** the update to the current block or current day's slots.
- **The Impact:** As a result, when a player is demoted on **Monday**, the system accidentally **wipes out all of their assigned reservations on other days (Tuesday, Thursday)**, setting them to `eliminated` with `slot_id = null`!
- The Monday reassignment queue runs and tries to re-allocate them to other Monday slots (which works), but the Thursday slot (which was perfectly fine and empty) is **lost forever** and remains empty, leaving the player incorrectly waitlisted.

---

## Proposed Changes — DONE

### [assignment.ts](file:///Users/sxxm/Documents/GitHub/wos1234/lib/assignment.ts)

1. **Demotion scoped to current block** — `.in("slot_id", slotIds)` on demotion update (line ~339).
2. **Multi-day heal deferred** — `deferHeal` on `processReservation`; `processMultiDayReservation` runs `healEliminatedReservations` once after all days.

---

## Verification Plan

### Automated tests
```bash
npm run test:assignment
```
Scenario 4: multi-day Mon+Thu, then Monday displacement — Thursday must stay assigned.

### Recovery for incorrectly waitlisted players
```bash
npm run recover:waitlist -- 테스터_52 테스터_26
```
