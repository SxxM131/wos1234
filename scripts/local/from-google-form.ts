#!/usr/bin/env npx tsx
/**
 * Local pipeline: Google Form responses.xlsx → same styled assignment Excel
 * as Admin export. No Supabase / Vercel.
 *
 * Usage:
 *   npm run local:assign -- "results/26.10.04 2614 SVS Reservation(응답).xlsx"
 *   npm run local:assign -- form.xlsx --cycle 34 --out results/reservation_cycle34.xlsx
 */
import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { buildStyledExcelWorkbook } from "../../lib/build-excel-workbook";
import { runOfflineAssignment } from "../../lib/offline-assignment";
import { parseGoogleFormExcel } from "../../lib/parse-google-form-excel";

function parseArgs() {
  const args = process.argv.slice(2);
  let input: string | undefined;
  let cycle = "1";
  let out: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cycle") {
      cycle = args[++i] ?? "";
      continue;
    }
    if (a === "--out") {
      out = args[++i];
      continue;
    }
    if (!a.startsWith("-") && !input) input = a;
  }
  return { input, cycle, out };
}

function yyyymmdd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function main() {
  const { input, cycle, out } = parseArgs();
  if (!input) {
    console.error(
      "Usage: npm run local:assign -- <google-form.xlsx> [--cycle N] [--out path.xlsx]"
    );
    process.exit(1);
  }

  const cycleId = parseInt(cycle, 10);
  if (!cycleId || Number.isNaN(cycleId)) {
    console.error("--cycle must be a positive integer.");
    process.exit(1);
  }

  const inputPath = resolve(input);
  const { applicants, skipped } = parseGoogleFormExcel(inputPath);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} row(s):`);
    for (const line of skipped) console.log(`  - ${line}`);
    console.log("");
  }

  if (applicants.length === 0) {
    console.error("No valid applicants in the form file.");
    process.exit(1);
  }

  const { data, results } = runOfflineAssignment(applicants);
  const outPath = resolve(
    out ?? `results/reservation_cycle${cycleId}_${yyyymmdd()}.xlsx`
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
}

main();
