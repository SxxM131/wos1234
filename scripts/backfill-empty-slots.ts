#!/usr/bin/env npx tsx
/** Fill empty slots from waitlist for current cycle. Run: npm run backfill:slots */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  backfillEmptySlotsForCycle,
  getCurrentCycleId,
} from "../lib/assignment";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
  console.log(`Backfilling empty slots for cycle ${cycleId}...`);
  const filled = await backfillEmptySlotsForCycle(supabase, cycleId);
  console.log(`Done. Promoted ${filled} waitlisted player(s) into empty slots.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
