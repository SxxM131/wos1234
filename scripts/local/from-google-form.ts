#!/usr/bin/env npx tsx
/**
 * Local pipeline: Google Form responses.xlsx → same styled assignment Excel
 * as Admin export. No Supabase / Vercel.
 *
 * Output: results/result_<mode>_<input file name> (override with --out).
 *
 * Usage:
 *   npm run local:assign -- "results/26.10.04 2614 SVS Reservation(응답).xlsx"
 *   npm run local:assign -- form.xlsx --out results/custom.xlsx
 *   npm run local:assign -- form.xlsx --mode=v2   (Monday ranked by Mon+Tue speedup)
 *
 * Runs V1–V5 checks on the result; exits 1 if any error.
 */
import { mkdirSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { runAssignmentChecks } from "../../lib/assignment-checks";
import { buildStyledExcelWorkbook } from "../../lib/build-excel-workbook";
import {
  assignmentSpeedup,
  isSpeedupMissing,
  runOfflineAssignment,
} from "../../lib/offline-assignment";
import { parseGoogleFormExcel } from "../../lib/parse-google-form-excel";
import {
  ASSIGNMENT_MODES,
  type AssignmentMode,
  type DayOfWeek,
} from "../../lib/types";

function parseArgs() {
  const args = process.argv.slice(2);
  let input: string | undefined;
  let out: string | undefined;
  let mode = "v1";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--mode=")) {
      mode = a.slice("--mode=".length);
      continue;
    }
    if (a === "--mode") {
      mode = args[++i] ?? "";
      continue;
    }
    if (a === "--out") {
      out = args[++i];
      continue;
    }
    if (!a.startsWith("-") && !input) input = a;
  }
  return { input, out, mode };
}

function main() {
  const { input, out, mode: modeArg } = parseArgs();
  if (!input) {
    console.error(
      "Usage: npm run local:assign -- <google-form.xlsx> [--mode v1|v2] [--out path.xlsx]"
    );
    process.exit(1);
  }

  if (!(ASSIGNMENT_MODES as readonly string[]).includes(modeArg)) {
    console.error(`--mode must be one of: ${ASSIGNMENT_MODES.join(", ")} (got "${modeArg}").`);
    process.exit(1);
  }
  const mode = modeArg as AssignmentMode;
  console.log("==============================");
  console.log(`  Assignment mode: ${mode}`);
  if (mode === "v2") console.log("  (Monday ranked by Mon + Tue speedup)");
  console.log("==============================\n");

  const inputPath = resolve(input);
  const { applicants, skipped } = parseGoogleFormExcel(inputPath, { mode });
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} row(s):`);
    for (const line of skipped) console.log(`  - ${line}`);
    console.log("");
  }

  if (applicants.length === 0) {
    console.error("No valid applicants in the form file.");
    process.exit(1);
  }

  const { data, results, slots, assignments } = runOfflineAssignment(
    applicants,
    { mode }
  );
  const outPath = resolve(
    out ?? `results/result_${mode}_${basename(inputPath)}`
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(buildStyledExcelWorkbook(data)));

  console.log(`Applicants: ${applicants.length}`);
  console.log(
    `Mon — ${results.mon.assigned} assigned, ${results.mon.waitlist} waitlist`
  );
  console.log(
    `Tue — ${results.tue.assigned} assigned, ${results.tue.waitlist} waitlist`
  );
  console.log(
    `Thu — ${results.thu.assigned} assigned, ${results.thu.waitlist} waitlist`
  );
  console.log(`Wrote ${outPath}`);

  // Blank speedup (blocks chosen): placed only in leftover slots, red in Excel
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const missingLines = applicants.flatMap((a) =>
    (["mon", "tue", "thu"] as DayOfWeek[])
      .filter((day) => isSpeedupMissing(a, day))
      .map((day) => {
        const hit = assignments.find(
          (r) =>
            r.player_id === a.playerId &&
            slotById.get(r.slot_id)?.day_of_week === day
        );
        const slot = hit ? slotById.get(hit.slot_id) : undefined;
        const where = slot
          ? `assigned (block ${slot.block_start_utc}, slot ${slot.slot_index + 1})`
          : "waitlist";
        return `  - ${a.name} (${a.playerId}) ${day}: ${where}`;
      })
  );
  if (missingLines.length) {
    console.log(`\nBlank speedup (lowest priority, red in Excel):`);
    for (const line of missingLines) console.log(line);
  }

  const applicantById = new Map(applicants.map((a) => [a.playerId, a]));
  const { errors } = runAssignmentChecks({
    slots,
    assigned: assignments,
    preferences: applicants.flatMap((a) =>
      a.days.flatMap((d) =>
        d.preferredBlocks.map((block) => ({
          player_id: a.playerId,
          day_of_week: d.dayOfWeek,
          block_start_utc: block,
        }))
      )
    ),
    speedupFor: (playerId, day) => {
      const a = applicantById.get(playerId);
      return a ? assignmentSpeedup(a, day as DayOfWeek, mode) : 0;
    },
  });
  if (errors > 0) process.exit(1);
}

main();
