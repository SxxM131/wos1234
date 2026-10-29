#!/usr/bin/env npx tsx
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchAllPages } from "../../lib/supabase";
import { runAssignmentChecks } from "../../lib/assignment-checks";

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

async function main() {
  console.log("Starting verification...");

  const { data: cycleData } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "current_cycle_id")
    .single();
  const cycleId = parseInt(cycleData?.value ?? "1", 10);

  const { data: slotsData } = await supabase.from("slots").select("*");
  const slots = slotsData ?? [];

  const { data: resData, error: resError } = await fetchAllPages(async (from, to) =>
    await supabase
      .from("reservations")
      .select("*")
      .eq("cycle_id", cycleId)
      .order("player_id")
      .order("status")
      .range(from, to)
  );
  if (resError) {
    throw new Error(`Failed to load reservations: ${resError.message}`);
  }
  const reservations = resData ?? [];

  const { data: prefData, error: prefError } = await fetchAllPages(async (from, to) =>
    await supabase
      .from("preferences")
      .select("*")
      .eq("cycle_id", cycleId)
      .order("player_id")
      .order("day_of_week")
      .order("block_start_utc")
      .range(from, to)
  );
  if (prefError) {
    throw new Error(`Failed to load preferences: ${prefError.message}`);
  }
  const preferences = prefData ?? [];

  const { data: playersData } = await supabase.from("players").select("*");
  const players = playersData ?? [];

  const assigned = reservations.filter((r) => r.status === "assigned" && r.slot_id !== null);
  const eliminatedPlayerIds = new Set<number>(
    reservations
      .filter((r) => r.status === "eliminated" && r.slot_id === null)
      .map((r) => r.player_id)
  );

  const playerMap = new Map<number, any>();
  for (const p of players) playerMap.set(p.player_id, p);

  function getSpeedup(playerId: number, day: string): number {
    const p = playerMap.get(playerId);
    if (!p) return 0;
    if (day === "mon") return p.speedup_mon;
    if (day === "tue") return p.speedup_tue;
    if (day === "thu") return p.speedup_thu;
    return 0;
  }

  const { errors } = runAssignmentChecks({
    slots,
    assigned,
    preferences,
    speedupFor: getSpeedup,
    eliminatedPlayerIds,
    playerName: (playerId) => playerMap.get(playerId)?.name ?? "?",
  });

  if (errors > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
