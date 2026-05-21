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
  processReservation,
  healEliminatedReservations,
} from "../lib/assignment";
import { DayOfWeek, DAY_CONFIG } from "../lib/types";

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

    console.log(`\n🔧 Recovering ${player.name} (ID ${player.game_id})...`);

    for (const [day, blocks] of Array.from(byDay.entries())) {
      const uniqueBlocks = Array.from(new Set(blocks)).sort((a, b) => a - b);
      const config = DAY_CONFIG[day];
      const speedup =
        config.speedupKey === "speedup_vp"
          ? player.speedup_vp
          : player.speedup_mo;

      const { data: daySlots } = await supabase
        .from("slots")
        .select("id")
        .eq("day_of_week", day);
      const slotIds = daySlots?.map((s) => s.id) ?? [];

      const { data: assigned } = await supabase
        .from("reservations")
        .select("id")
        .eq("player_id", player.game_id)
        .eq("cycle_id", cycleId)
        .eq("status", "assigned")
        .in("slot_id", slotIds)
        .maybeSingle();

      if (assigned) {
        console.log(`  ✓ ${day}: already assigned`);
        continue;
      }

      const hasEmptySlot = await blockHasCapacity(day, uniqueBlocks[0], cycleId);
      if (!hasEmptySlot) {
        console.log(`  ✗ ${day}: preferred blocks full, skip`);
        continue;
      }

      const result = await processReservation(supabase, {
        gameId: player.game_id,
        name: player.name,
        alliance: player.alliance,
        dayOfWeek: day,
        speedup,
        preferredBlocks: uniqueBlocks,
        skipPlayerUpsert: true,
      });
      console.log(
        `  → ${day}: ${result.success ? "✅" : "⚠️"} ${result.message}`
      );
    }

    await healEliminatedReservations(supabase, [player.game_id], cycleId, now);
  }

  console.log("\nDone.");
}

async function blockHasCapacity(
  day: DayOfWeek,
  blockStart: number,
  cycleId: number
): Promise<boolean> {
  const { data: blockSlots } = await supabase
    .from("slots")
    .select("id")
    .eq("day_of_week", day)
    .eq("block_start_utc", blockStart)
    .eq("is_active", true);

  if (!blockSlots?.length) return false;

  const slotIds = blockSlots.map((s) => s.id);
  const { data: taken } = await supabase
    .from("reservations")
    .select("slot_id")
    .in("slot_id", slotIds)
    .eq("cycle_id", cycleId)
    .eq("status", "assigned");

  return (taken?.length ?? 0) < blockSlots.length;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
