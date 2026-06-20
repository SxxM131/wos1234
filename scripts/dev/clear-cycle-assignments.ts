#!/usr/bin/env npx tsx
/**
 * Remove assignment results for the current cycle (keeps preferences / players).
 * Usage: npm run clear:assignments
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getCurrentCycleId } from "../../lib/assignment";

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
  const { error } = await supabase
    .from("reservations")
    .delete()
    .eq("cycle_id", cycleId);
  if (error) throw error;

  await supabase.from("settings").delete().eq("key", "last_assignment_run");

  console.log(
    `Cleared all reservations for cycle #${cycleId} and reset last_assignment_run.`
  );
  console.log("Preferences and players are unchanged.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
