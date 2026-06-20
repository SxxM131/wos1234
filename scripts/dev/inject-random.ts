#!/usr/bin/env npx tsx
/**
 * Inject random test applications into the current cycle (preferences only).
 * Usage: npm run inject:random
 *        npm run inject:random -- 90
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  processMultiDayReservation,
  getCurrentCycleId,
  getAssignmentApplicantCounts,
} from "../../lib/assignment";
import { DayOfWeek, ALLIANCE_OPTIONS } from "../../lib/types";

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

const ALLIANCES = [...ALLIANCE_OPTIONS];
const TIME_BLOCKS = Array.from({ length: 12 }, (_, i) => i * 2);
const DEFAULT_BASE_PLAYER_ID = 300001;

const DEFAULT_COUNT = 120;

function parseCliArgs(): { count: number; basePlayerIdArg?: string } {
  const args = process.argv.slice(2);
  const hasBadDash = args.some((a) => /[\u2013\u2014\u2212]/.test(a));
  const numeric = args
    .map((a) => parseInt(a, 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (hasBadDash && numeric.length === 0) {
    console.error(
      "Invalid dash in arguments. Use ASCII hyphens only:\n" +
        "  npm run inject:random -- 120\n" +
        "  (not an em dash — before 120)\n" +
        "Or omit the count (default 120):\n" +
        "  npm run inject:random"
    );
    process.exit(1);
  }

  const count = numeric[0] ?? DEFAULT_COUNT;
  const basePlayerIdArg =
    numeric.length >= 2 ? String(numeric[1]) : undefined;

  if (!Number.isFinite(count) || count < 1) {
    console.error(
      `Invalid count. Usage: npm run inject:random [-- <count> [basePlayerId]]\n` +
        `Example: npm run inject:random -- 120`
    );
    process.exit(1);
  }

  return { count, basePlayerIdArg };
}

const { count, basePlayerIdArg } = parseCliArgs();

function getRandomPrefs(n: number): number[] {
  const primeTime = [10, 12, 14, 16, 20];
  const pool = [...TIME_BLOCKS];
  const prefs: number[] = [];

  while (prefs.length < n && pool.length > 0) {
    const usePrime =
      Math.random() < 0.55 && primeTime.some((t) => pool.includes(t));
    let chosen: number;
    if (usePrime) {
      const primes = primeTime.filter((t) => pool.includes(t));
      chosen = primes[Math.floor(Math.random() * primes.length)];
    } else {
      chosen = pool[Math.floor(Math.random() * pool.length)];
    }
    prefs.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return prefs;
}

function randomSpeedup(): number {
  return Math.floor(Math.random() * 50) * 10 + 10;
}

async function main() {
  const cycleId = await getCurrentCycleId(supabase);

  let basePlayerId = DEFAULT_BASE_PLAYER_ID;
  if (basePlayerIdArg) {
    basePlayerId = parseInt(basePlayerIdArg, 10);
  } else {
    const { data: maxRow } = await supabase
      .from("players")
      .select("player_id")
      .order("player_id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxRow?.player_id != null) {
      basePlayerId = Math.max(DEFAULT_BASE_PLAYER_ID, maxRow.player_id + 1);
    }
  }

  console.log(
    `Injecting ${count} random applicants into cycle #${cycleId} (player_id ${basePlayerId}–${basePlayerId + count - 1})...\n`
  );

  await supabase
    .from("settings")
    .upsert({ key: "reservation_open", value: "true" });

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < count; i++) {
    const playerId = basePlayerId + i;
    const name = `테스터_${String(i + 1).padStart(2, "0")}`;
    const alliance = ALLIANCES[Math.floor(Math.random() * ALLIANCES.length)];

    const days = Math.random();
    const dayInputs: {
      dayOfWeek: DayOfWeek;
      speedup: number;
      preferredBlocks: number[];
    }[] = [];

    if (days < 0.85) {
      dayInputs.push({
        dayOfWeek: "mon",
        speedup: randomSpeedup(),
        preferredBlocks: getRandomPrefs(2 + Math.floor(Math.random() * 2)),
      });
    }
    if (days < 0.7 || days > 0.5) {
      dayInputs.push({
        dayOfWeek: "tue",
        speedup: randomSpeedup(),
        preferredBlocks: getRandomPrefs(2 + Math.floor(Math.random() * 2)),
      });
    }
    if (days > 0.15) {
      dayInputs.push({
        dayOfWeek: "thu",
        speedup: randomSpeedup(),
        preferredBlocks: getRandomPrefs(2 + Math.floor(Math.random() * 2)),
      });
    }

    if (!dayInputs.length) {
      dayInputs.push({
        dayOfWeek: "mon",
        speedup: randomSpeedup(),
        preferredBlocks: getRandomPrefs(3),
      });
    }

    const res = await processMultiDayReservation(
      supabase,
      playerId,
      name,
      alliance,
      dayInputs
    );

    if (res.success) ok++;
    else {
      fail++;
      console.log(`  ✗ ${name} (${playerId}): ${res.message}`);
    }

    if ((i + 1) % 10 === 0 || i === count - 1) {
      console.log(`  … ${i + 1}/${count} submitted`);
    }
  }

  const applicants = await getAssignmentApplicantCounts(supabase, cycleId);

  console.log("\n=========================================================");
  console.log(`Done: ${ok} ok, ${fail} failed`);
  console.log(`Applicants — Mon ${applicants.mon} · Tue ${applicants.tue} · Thu ${applicants.thu}`);
  console.log("\nNext steps:");
  console.log("  1. /status — applications only until batch assign");
  console.log("  2. Admin → Run full assignment (R4+)");
  console.log("  3. /status and /r/.../check to verify results");
  console.log("\nCleanup: Admin → Reset cycle (type RESET)");
  console.log("=========================================================");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
