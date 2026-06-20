#!/usr/bin/env npx tsx
/**
 * Audit current cycle: assigned, waitlist, empty slots, logic gaps.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getCurrentCycleId } from "../../lib/assignment";
import { fetchAllPages } from "../../lib/supabase";
import { DayOfWeek, DAY_CONFIG } from "../../lib/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const env = Object.fromEntries(
  readFileSync(resolve(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const DAYS: DayOfWeek[] = ["mon", "tue", "thu"];

async function main() {
  const cycleId = await getCurrentCycleId(supabase);
  console.log(`\n═══ Reservation audit — cycle ${cycleId} ═══\n`);

  const { data: slots } = await supabase
    .from("slots")
    .select("id, day_of_week, block_start_utc, slot_index, is_active")
    .eq("is_active", true);

  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      "id, player_id, slot_id, status, applied_at, players(name, speedup_mon, speedup_tue, speedup_thu)"
    )
    .eq("cycle_id", cycleId);

  const { data: prefs, error: prefError } = await fetchAllPages(async (from, to) =>
    await supabase
      .from("preferences")
      .select("player_id, day_of_week, block_start_utc")
      .eq("cycle_id", cycleId)
      .order("player_id")
      .order("day_of_week")
      .order("block_start_utc")
      .range(from, to)
  );
  if (prefError) {
    throw new Error(`Failed to load preferences: ${prefError.message}`);
  }

  const slotMap = new Map((slots ?? []).map((s) => [s.id, s]));
  const resList = reservations ?? [];
  const prefList = prefs ?? [];

  const issues: string[] = [];

  for (const day of DAYS) {
    const daySlots = (slots ?? []).filter((s) => s.day_of_week === day);
    const blocks = [...new Set(daySlots.map((s) => s.block_start_utc))].sort(
      (a, b) => a - b
    );

    const assigned = resList.filter(
      (r) =>
        r.status === "assigned" &&
        r.slot_id &&
        slotMap.get(r.slot_id)?.day_of_week === day
    );
    const eliminated = resList.filter(
      (r) => r.status === "eliminated" && r.slot_id === null
    );

    const applicants = new Set(
      prefList.filter((p) => p.day_of_week === day).map((p) => p.player_id)
    );
    const assignedIds = new Set(assigned.map((r) => r.player_id));

    const waitlisted = [...applicants].filter((id) => !assignedIds.has(id));

    console.log(`── ${DAY_CONFIG[day].label} (${day}) ──`);
    console.log(
      `  Applicants (prefs): ${applicants.size} | Assigned: ${assigned.length} | Waitlisted: ${waitlisted.length}`
    );
    console.log(
      `  Slots: ${daySlots.length} total (${blocks.length} blocks × 4)`
    );

    let emptySlots = 0;
    let emptyWithWaitlistCandidate = 0;

    for (const block of blocks) {
      const blockSlotIds = daySlots
        .filter((s) => s.block_start_utc === block)
        .map((s) => s.id);
      const inBlock = assigned.filter((r) =>
        blockSlotIds.includes(r.slot_id!)
      );

      if (inBlock.length > 4) {
        issues.push(`${day} block ${block}: ${inBlock.length} assigned (>4)`);
      }

      const emptyInBlock = 4 - inBlock.length;
      if (emptyInBlock > 0) {
        emptySlots += emptyInBlock;

        const wantThisBlock = new Set(
          prefList
            .filter(
              (p) =>
                p.day_of_week === day && p.block_start_utc === block
            )
            .map((p) => p.player_id)
        );
        const waitlistWantHere = waitlisted.filter((id) =>
          wantThisBlock.has(id)
        );
        if (waitlistWantHere.length > 0) {
          emptyWithWaitlistCandidate += emptyInBlock;
          if (emptyInBlock > 0 && waitlistWantHere.length > 0) {
            issues.push(
              `${day} block ${block} UTC: ${emptyInBlock} empty slot(s), ${waitlistWantHere.length} waitlisted wanted this block (recoverable?)`
            );
          }
        }
      }
    }

    console.log(`  Empty slot positions: ${emptySlots}`);
    console.log(
      `  Empty slots where waitlist wanted that block: ${emptyWithWaitlistCandidate} slot-positions`
    );

    const elimOnDay = waitlisted.length;
    const elimRows = resList.filter(
      (r) =>
        r.status === "eliminated" &&
        applicants.has(r.player_id)
    );
    const elimWithoutPref = resList.filter(
      (r) =>
        r.status === "eliminated" &&
        !applicants.has(r.player_id)
    );
    if (elimWithoutPref.length) {
      issues.push(
        `${day}: ${elimWithoutPref.length} eliminated rows without prefs (orphan)`
      );
    }

    const multiElim = new Map<number, number>();
    for (const r of elimRows) {
      if (!applicants.has(r.player_id)) continue;
      const dayPrefs = prefList.some(
        (p) => p.player_id === r.player_id && p.day_of_week === day
      );
      if (!dayPrefs) continue;
      multiElim.set(r.player_id, (multiElim.get(r.player_id) ?? 0) + 1);
    }
    const dupElim = [...multiElim.entries()].filter(([, c]) => c > 1);
    if (dupElim.length) {
      issues.push(
        `${day}: ${dupElim.length} players with multiple eliminated rows`
      );
    }

    const prefNoStatus = [...applicants].filter((id) => {
      const hasA = assignedIds.has(id);
      const hasE = resList.some(
        (r) =>
          r.player_id === id &&
          r.status === "eliminated" &&
          r.slot_id === null
      );
      return !hasA && !hasE;
    });
    if (prefNoStatus.length) {
      issues.push(
        `${day}: ${prefNoStatus.length} applicants with prefs but neither assigned nor eliminated`
      );
    }

    const bothAssignedElim = assigned.filter((r) =>
      resList.some(
        (e) =>
          e.player_id === r.player_id &&
          e.status === "eliminated" &&
          e.id !== r.id
      )
    );
    if (bothAssignedElim.length) {
      issues.push(
        `${day}: ${bothAssignedElim.length} players both assigned and eliminated (same cycle)`
      );
    }
  }

  console.log("\n── Global ──");
  const cancelled = resList.filter((r) => r.status === "cancelled");
  console.log(`  Cancelled reservations: ${cancelled.length}`);

  const totalAssigned = resList.filter((r) => r.status === "assigned").length;
  const totalElim = resList.filter(
    (r) => r.status === "eliminated"
  ).length;
  console.log(`  All assigned: ${totalAssigned}`);
  console.log(`  All eliminated rows: ${totalElim}`);

  const { data: open } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "reservation_open")
    .single();
  console.log(`  reservation_open: ${open?.value}`);

  console.log("\n── Issues / gaps ──");
  if (issues.length === 0) {
    console.log("  None detected by audit rules.");
  } else {
    issues.forEach((i) => console.log(`  ⚠ ${i}`));
  }

  console.log("\n── Logic completeness (design vs data) ──");
  console.log(`
  [OK] Top-4 per 2h block by speedup — if no block overflow issues above.
  [OK] Waitlist = has prefs, no assigned slot that day.
  [GAP] Empty slot + waitlist who preferred THAT block: NOT auto-filled.
        promoteOnCancel only runs on admin cancel, not on initial pass.
        recover-waitlist.ts exists for manual re-run.
  [GAP] New submit does not scan all blocks to place waitlisted players.
  [NOTE] Player fully failed all prefs → eliminated row (waitlist UI).
  [NOTE] 48 slots/day max; more applicants → waitlist is expected.
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
