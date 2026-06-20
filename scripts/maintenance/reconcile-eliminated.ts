#!/usr/bin/env npx tsx
/** Re-run heal for all players with preferences (fixes stale waitlist rows). */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getCurrentCycleId,
  healEliminatedReservations,
  backfillEmptySlotsForCycle,
} from "../../lib/assignment";

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
  const cycleId = await getCurrentCycleId(supabase);
  const { data: prefs } = await supabase
    .from("preferences")
    .select("player_id")
    .eq("cycle_id", cycleId);
  const ids = [...new Set((prefs ?? []).map((p) => p.player_id))];
  console.log(`Reconciling ${ids.length} players on cycle ${cycleId}...`);
  const now = new Date().toISOString();
  await healEliminatedReservations(supabase, ids, cycleId, now);
  const filled = await backfillEmptySlotsForCycle(supabase, cycleId);
  console.log(`Backfilled ${filled} empty slot(s).`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
