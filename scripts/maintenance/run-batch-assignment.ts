#!/usr/bin/env npx tsx
/**
 * Same backend as Admin → "Run full assignment".
 * Usage: npm run run:batch
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getCurrentCycleId,
  getAssignmentApplicantCounts,
  getLastAssignmentRun,
  runBatchAssignmentForCycle,
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

async function countAssigned(cycleId: number, day: string) {
  const { data: daySlots } = await supabase
    .from("slots")
    .select("id")
    .eq("day_of_week", day);
  const slotIds = daySlots?.map((s) => s.id) ?? [];
  if (!slotIds.length) return 0;
  const { count } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("cycle_id", cycleId)
    .eq("status", "assigned")
    .in("slot_id", slotIds);
  return count ?? 0;
}

async function main() {
  const cycleId = await getCurrentCycleId(supabase);
  const applicants = await getAssignmentApplicantCounts(supabase, cycleId);
  const lastRun = await getLastAssignmentRun(supabase);

  console.log(`Cycle #${cycleId}`);
  console.log(
    `Applicants — Mon ${applicants.mon} · Tue ${applicants.tue} · Thu ${applicants.thu}`
  );
  console.log(
    `Assigned before — Mon ${await countAssigned(cycleId, "mon")} · Tue ${await countAssigned(cycleId, "tue")} · Thu ${await countAssigned(cycleId, "thu")}`
  );
  console.log(
    lastRun
      ? `Last assignment run: ${new Date(lastRun).toLocaleString()}`
      : "Last assignment run: never"
  );

  const totalApplicants = applicants.mon + applicants.tue + applicants.thu;
  if (totalApplicants === 0) {
    console.log(
      "\nNo applicants in this cycle. Run: npm run inject:random -- 10"
    );
    process.exit(1);
  }

  console.log("\nRunning batch assignment (Hopcroft-Karp)…\n");
  const results = await runBatchAssignmentForCycle(supabase, cycleId);

  console.log("Results:");
  console.log(
    `  Mon — ${results.mon.assigned} assigned, ${results.mon.eliminated} waitlist`
  );
  console.log(
    `  Tue — ${results.tue.assigned} assigned, ${results.tue.eliminated} waitlist`
  );
  console.log(
    `  Thu — ${results.thu.assigned} assigned, ${results.thu.eliminated} waitlist`
  );

  console.log(
    `\nAssigned after — Mon ${await countAssigned(cycleId, "mon")} · Tue ${await countAssigned(cycleId, "tue")} · Thu ${await countAssigned(cycleId, "thu")}`
  );
  const nextRun = await getLastAssignmentRun(supabase);
  console.log(
    nextRun
      ? `last_assignment_run updated: ${new Date(nextRun).toLocaleString()}`
      : "warning: last_assignment_run not set"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
