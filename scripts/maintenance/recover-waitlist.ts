#!/usr/bin/env npx tsx
/**
 * Backfill empty slots for waitlisted players (prefs that day + not assigned).
 * Run: npx tsx scripts/maintenance/recover-waitlist.ts
 * Optional: npx tsx scripts/maintenance/recover-waitlist.ts 테스터_52 테스터_26
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getCurrentCycleId,
  backfillEmptySlotsForCycle,
} from "../../lib/assignment";
import { DayOfWeek } from "../../lib/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
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

const nameFilter = process.argv.slice(2);

async function main() {
  const cycleId = await getCurrentCycleId(supabase);

  let playersQuery = supabase.from("players").select("*");
  if (nameFilter.length > 0) {
    playersQuery = playersQuery.in("name", nameFilter);
  }
  const { data: players } = await playersQuery;

  if (!players?.length) {
    console.log("No players found.");
    return;
  }

  for (const player of players) {
    const { data: prefs } = await supabase
      .from("preferences")
      .select("day_of_week, block_start_utc")
      .eq("player_id", player.player_id)
      .eq("cycle_id", cycleId);

    if (!prefs?.length) {
      console.log(`⏭ ${player.name}: no preferences`);
      continue;
    }

    const prefDays = Array.from(
      new Set(prefs.map((p) => p.day_of_week as DayOfWeek))
    );
    let waitlistedDays = 0;
    for (const day of prefDays) {
      const { data: daySlots } = await supabase
        .from("slots")
        .select("id")
        .eq("day_of_week", day);
      const slotIds = (daySlots ?? []).map((s) => s.id);
      if (!slotIds.length) continue;
      const { data: assigned } = await supabase
        .from("reservations")
        .select("id")
        .eq("player_id", player.player_id)
        .eq("cycle_id", cycleId)
        .eq("status", "assigned")
        .in("slot_id", slotIds)
        .limit(1);
      if (!assigned?.length) waitlistedDays++;
    }

    if (waitlistedDays === 0) {
      console.log(`⏭ ${player.name}: assigned on all preferred days`);
      continue;
    }

    console.log(
      `  → ${player.name}: waitlisted on ${waitlistedDays} day(s) — included in backfill`
    );
  }

  const filled = await backfillEmptySlotsForCycle(supabase, cycleId);
  console.log(`\nBackfilled ${filled} empty slot(s) cycle-wide.`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
