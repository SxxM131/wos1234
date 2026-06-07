#!/usr/bin/env npx tsx
/**
 * Re-assign players who are waitlisted (eliminated) but have empty preferred blocks.
 * Run: npx tsx scripts/recover-waitlist.ts
 * Optional: npx tsx scripts/recover-waitlist.ts 테스터_52 테스터_26
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getCurrentCycleId,
  healEliminatedReservations,
  backfillEmptySlotsForCycle,
} from "../lib/assignment";
import { DayOfWeek } from "../lib/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
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
  const now = new Date().toISOString();

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
    const { data: eliminated } = await supabase
      .from("reservations")
      .select("id")
      .eq("player_id", player.game_id)
      .eq("cycle_id", cycleId)
      .eq("status", "eliminated");

    if (!eliminated?.length) {
      console.log(`⏭ ${player.name}: not on waitlist`);
      continue;
    }

    const { data: prefs } = await supabase
      .from("preferences")
      .select("day_of_week, block_start_utc")
      .eq("player_id", player.game_id)
      .eq("cycle_id", cycleId);

    if (!prefs?.length) {
      console.log(`⏭ ${player.name}: no preferences`);
      continue;
    }

    const byDay = new Map<DayOfWeek, number[]>();
    for (const p of prefs) {
      const day = p.day_of_week as DayOfWeek;
      const list = byDay.get(day) ?? [];
      list.push(p.block_start_utc);
      byDay.set(day, list);
    }

    console.log(`  → ${player.name}: queued for heal + backfill`);
    await healEliminatedReservations(supabase, [player.game_id], cycleId, now);
  }

  const filled = await backfillEmptySlotsForCycle(supabase, cycleId);
  console.log(`\nBackfilled ${filled} empty slot(s) cycle-wide.`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
