#!/usr/bin/env npx tsx
/**
 * Obsolete: waitlist is derived from preferences + unassigned days.
 * healEliminatedReservations was removed. Prefer `npm run verify:assignment`.
 */
console.log(
  "reconcile:waitlist is obsolete — waitlist UI/promote/backfill use prefs, not eliminated markers.\n" +
    "Run: npm run verify:assignment"
);
process.exit(0);
