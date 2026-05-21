/**
 * Isolated load test: 150 players, varied 1/2/3-day patterns, integrity checks.
 * Uses cycle 9999 only; restores production cycle and cleans up after.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  processReservation,
  processMultiDayReservation,
  getCurrentCycleId,
} from "../lib/assignment";
import { DUPLICATE_DAY_MESSAGE } from "../lib/reservation-guard";
import { DayOfWeek } from "../lib/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");
const content = readFileSync(envPath, "utf8");
const vars = Object.fromEntries(
  content
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("="))
    .map(([k, ...v]) => [k.trim(), v.join("=").trim()])
);

const supabase = createClient(
  vars.NEXT_PUBLIC_SUPABASE_URL,
  vars.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_CYCLE = 9999;
const PLAYER_BASE = 400001;
const PLAYER_COUNT = 150;
const ALL_DAYS: DayOfWeek[] = ["mon", "tue", "thu"];
const TIME_BLOCKS = Array.from({ length: 12 }, (_, i) => i * 2);
const PRIME_BLOCKS = [10, 12, 14, 16];
const ALLIANCES = ["WOS", "LEO", "MOON", "SUN", "ZEUS", "STAR", "NOVA"];

// Seeded RNG for reproducible runs
let seed = 42;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function getPrefs(count: number, hotBlock?: number): number[] {
  const pool = [...TIME_BLOCKS];
  const prefs: number[] = [];
  if (hotBlock !== undefined && pool.includes(hotBlock) && rand() < 0.85) {
    prefs.push(hotBlock);
    pool.splice(pool.indexOf(hotBlock), 1);
  }
  while (prefs.length < count) {
    const usePrime = rand() < 0.55 && PRIME_BLOCKS.some((b) => pool.includes(b));
    let chosen: number;
    if (usePrime) {
      const primes = PRIME_BLOCKS.filter((b) => pool.includes(b));
      chosen = pick(primes);
    } else {
      chosen = pick(pool);
    }
    prefs.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return prefs;
}

type DayPattern = "mon" | "tue" | "thu" | "mon_tue" | "mon_thu" | "tue_thu" | "all";

interface TestPlayer {
  gameId: number;
  name: string;
  alliance: string;
  pattern: DayPattern;
  days: DayOfWeek[];
  speedup: Record<DayOfWeek, number>;
  prefs: Record<DayOfWeek, number[]>;
  submitMode: "multi" | "sequential";
}

function daysForPattern(p: DayPattern): DayOfWeek[] {
  switch (p) {
    case "mon":
      return ["mon"];
    case "tue":
      return ["tue"];
    case "thu":
      return ["thu"];
    case "mon_tue":
      return ["mon", "tue"];
    case "mon_thu":
      return ["mon", "thu"];
    case "tue_thu":
      return ["tue", "thu"];
    case "all":
      return ["mon", "tue", "thu"];
  }
}

function buildPlayers(): TestPlayer[] {
  const patterns: DayPattern[] = [
    "mon",
    "tue",
    "thu",
    "mon_tue",
    "mon_thu",
    "tue_thu",
    "all",
  ];
  // Realistic mix: ~35% 1-day, ~40% 2-day, ~25% 3-day
  const patternWeights: DayPattern[] = [
    ...Array(18).fill("mon"),
    ...Array(17).fill("tue"),
    ...Array(17).fill("thu"),
    ...Array(20).fill("mon_tue"),
    ...Array(20).fill("mon_thu"),
    ...Array(20).fill("tue_thu"),
    ...Array(38).fill("all"),
  ];

  const players: TestPlayer[] = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const gameId = PLAYER_BASE + i;
    const pattern = patternWeights[i] ?? pick(patterns);
    const days = daysForPattern(pattern);
    const alliance = pick(ALLIANCES);
    const name = `Sim_${String(i + 1).padStart(3, "0")}`;

    const speedup = {} as Record<DayOfWeek, number>;
    const prefs = {} as Record<DayOfWeek, number[]>;
    for (const d of ALL_DAYS) {
      if (!days.includes(d)) continue;
      const tier = rand();
      if (tier < 0.25) speedup[d] = randInt(1, 5) * 10;
      else if (tier < 0.7) speedup[d] = randInt(6, 25) * 10;
      else speedup[d] = randInt(26, 50) * 10;

      const prefCount = rand() < 0.2 ? 1 : rand() < 0.5 ? 2 : 3;
      const hot = d === "mon" && rand() < 0.35 ? 12 : undefined;
      prefs[d] = getPrefs(prefCount, hot);
    }

    players.push({
      gameId,
      name,
      alliance,
      pattern,
      days,
      speedup,
      prefs,
      submitMode: i % 7 === 0 ? "sequential" : "multi",
    });
  }
  return players;
}

const testPlayers = buildPlayers();
const testIds = testPlayers.map((p) => p.gameId);

async function cleanup() {
  await supabase.from("reservations").delete().eq("cycle_id", TEST_CYCLE);
  await supabase.from("preferences").delete().eq("cycle_id", TEST_CYCLE);
  await supabase.from("players").delete().in("game_id", testIds);
}

type CheckResult = { ok: boolean; name: string; detail?: string };

async function verifyIntegrity(
  sb: SupabaseClient,
  cycleId: number
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const { data: reservations } = await sb
    .from("reservations")
    .select("id, player_id, slot_id, status, slots(day_of_week, block_start_utc, slot_index)")
    .eq("cycle_id", cycleId);

  const { data: slots } = await sb.from("slots").select("id, day_of_week, block_start_utc");
  const slotMap = new Map((slots ?? []).map((s) => [s.id, s]));

  const assigned = (reservations ?? []).filter((r) => r.status === "assigned" && r.slot_id);

  // 1) Max 4 per block
  const blockCounts = new Map<string, number>();
  for (const r of assigned) {
    const slot = slotMap.get(r.slot_id!);
    if (!slot) continue;
    const key = `${slot.day_of_week}:${slot.block_start_utc}`;
    blockCounts.set(key, (blockCounts.get(key) ?? 0) + 1);
  }
  const overflow = [...blockCounts.entries()].filter(([, c]) => c > 4);
  results.push({
    ok: overflow.length === 0,
    name: "Block capacity (≤4 per 2h block)",
    detail: overflow.length
      ? overflow.map(([k, c]) => `${k}=${c}`).join(", ")
      : `${blockCounts.size} blocks used`,
  });

  // 2) At most one assigned per player per day
  const playerDayAssigned = new Map<string, number>();
  for (const r of assigned) {
    const slot = slotMap.get(r.slot_id!);
    if (!slot) continue;
    const key = `${r.player_id}:${slot.day_of_week}`;
    playerDayAssigned.set(key, (playerDayAssigned.get(key) ?? 0) + 1);
  }
  const dupDay = [...playerDayAssigned.entries()].filter(([, c]) => c > 1);
  results.push({
    ok: dupDay.length === 0,
    name: "One assigned slot per player per day",
    detail: dupDay.length ? dupDay.map(([k]) => k).join(", ") : "OK",
  });

  // 3) Preferences count vs players who applied
  const { data: prefs } = await sb
    .from("preferences")
    .select("player_id, day_of_week")
    .eq("cycle_id", cycleId);

  const prefByPlayerDay = new Set(
    (prefs ?? []).map((p) => `${p.player_id}:${p.day_of_week}`)
  );
  const expectedApps = testPlayers.reduce((n, p) => n + p.days.length, 0);
  results.push({
    ok: (prefs ?? []).length >= expectedApps * 0.9,
    name: "Preferences recorded for submissions",
    detail: `${prefs?.length ?? 0} prefs / ~${expectedApps} day-apps`,
  });

  // 4) Players assigned on both mon AND thu (cross-day independence)
  const bothDays = new Map<number, Set<DayOfWeek>>();
  for (const r of assigned) {
    const slot = slotMap.get(r.slot_id!);
    if (!slot) continue;
    if (!bothDays.has(r.player_id)) bothDays.set(r.player_id, new Set());
    bothDays.get(r.player_id)!.add(slot.day_of_week as DayOfWeek);
  }
  const dualAssigned = [...bothDays.entries()].filter(
    ([, days]) => days.has("mon") && days.has("thu")
  );
  results.push({
    ok: dualAssigned.length >= 15,
    name: "Cross-day: players can hold Mon+Thu assigned together",
    detail: `${dualAssigned.length} players with both mon & thu slots`,
  });

  return results;
}

async function run() {
  const { data: origCycleSetting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "current_cycle_id")
    .single();
  const originalCycle = origCycleSetting?.value ?? "1";

  const patternCounts: Record<string, number> = {};
  for (const p of testPlayers) {
    patternCounts[p.pattern] = (patternCounts[p.pattern] ?? 0) + 1;
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  150-player reservation simulation (cycle 9999, isolated)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\n📋 Player mix:");
  for (const [pat, n] of Object.entries(patternCounts).sort()) {
    console.log(`   ${pat}: ${n}`);
  }
  const seqCount = testPlayers.filter((p) => p.submitMode === "sequential").length;
  console.log(`   sequential submit (wizard-style): ${seqCount}`);
  console.log(`   multi-day batch submit: ${PLAYER_COUNT - seqCount}`);

  try {
    await supabase
      .from("settings")
      .upsert({ key: "current_cycle_id", value: String(TEST_CYCLE) });
    await supabase
      .from("settings")
      .upsert({ key: "reservation_open", value: "true" });
    await cleanup();

    console.log("\n── Stage 1: Submit 150 players ──\n");
    let submitOk = 0;
    let submitPartial = 0;
    let submitFail = 0;
    const errors: string[] = [];

    for (let i = 0; i < testPlayers.length; i++) {
      const p = testPlayers[i];
      const daysInput = p.days.map((d) => ({
        dayOfWeek: d,
        speedup: p.speedup[d],
        preferredBlocks: p.prefs[d],
      }));

      let res;
      if (p.submitMode === "sequential") {
        const msgs: string[] = [];
        let any = false;
        for (const day of daysInput) {
          const r = await processReservation(supabase, {
            gameId: p.gameId,
            name: p.name,
            alliance: p.alliance,
            dayOfWeek: day.dayOfWeek,
            speedup: day.speedup,
            preferredBlocks: day.preferredBlocks,
          });
          msgs.push(r.message);
          if (r.success) any = true;
        }
        res = { success: any, message: msgs.join(" | ") };
      } else {
        res = await processMultiDayReservation(
          supabase,
          p.gameId,
          p.name,
          p.alliance,
          daysInput
        );
      }

      if (res.success) submitOk++;
      else if (res.message.includes("applied") || res.message.includes("UTC")) {
        submitPartial++;
      } else {
        submitFail++;
        if (errors.length < 8) errors.push(`${p.name}: ${res.message.slice(0, 80)}`);
      }

      if ((i + 1) % 25 === 0) {
        console.log(`   … ${i + 1}/${PLAYER_COUNT} processed`);
      }
    }

    console.log(`\n   Results: full/partial success=${submitOk + submitPartial}, hard fail=${submitFail}`);
    if (errors.length) {
      console.log("   Sample failures:");
      errors.forEach((e) => console.log(`     - ${e}`));
    }

    const cycleId = await getCurrentCycleId(supabase);

    console.log("\n── Stage 2: Per-day statistics ──\n");

    const { data: reservations } = await supabase
      .from("reservations")
      .select("player_id, status, slot_id, slots(day_of_week, block_start_utc)")
      .eq("cycle_id", cycleId);

    const resList = reservations ?? [];

    for (const day of ALL_DAYS) {
      const assigned = resList.filter(
        (r) =>
          r.status === "assigned" &&
          r.slot_id &&
          (r.slots as { day_of_week: string } | null)?.day_of_week === day
      );
      const { data: dayPrefs } = await supabase
        .from("preferences")
        .select("player_id")
        .eq("cycle_id", cycleId)
        .eq("day_of_week", day);
      const applicants = new Set((dayPrefs ?? []).map((p) => p.player_id));
      const assignedIds = new Set(assigned.map((r) => r.player_id));
      const waitlisted = [...applicants].filter((id) => !assignedIds.has(id));

      console.log(`   ${day.toUpperCase()}: applicants=${applicants.size}, assigned=${assigned.length}, waitlisted=${waitlisted.length}`);
    }

    const threeDayPlayers = testPlayers.filter((p) => p.days.length === 3);
    let tripleAssigned = 0;
    for (const p of threeDayPlayers) {
      const count = ALL_DAYS.filter((d) =>
        resList.some(
          (r) =>
            r.player_id === p.gameId &&
            r.status === "assigned" &&
            (r.slots as { day_of_week: string } | null)?.day_of_week === d
        )
      ).length;
      if (count >= 1) tripleAssigned++;
    }
    console.log(
      `\n   3-day applicants: ${threeDayPlayers.length}, got ≥1 slot on any day: ${tripleAssigned}`
    );

    console.log("\n── Stage 3: Integrity checks ──\n");
    const checks = await verifyIntegrity(supabase, cycleId);
    let checksPassed = 0;
    for (const c of checks) {
      const mark = c.ok ? "✅" : "❌";
      console.log(`   ${mark} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
      if (c.ok) checksPassed++;
    }

    console.log("\n── Stage 4: Duplicate re-submit (20 players) ──\n");
    let dupBlocked = 0;
    const dupSample = testPlayers.filter((p) => p.days.length > 0).slice(0, 20);
    for (const p of dupSample) {
      const day = p.days[0];
      const r = await processReservation(supabase, {
        gameId: p.gameId,
        name: p.name,
        alliance: p.alliance,
        dayOfWeek: day,
        speedup: 9999,
        preferredBlocks: [0],
      });
      if (!r.success && r.message.includes(DUPLICATE_DAY_MESSAGE)) dupBlocked++;
    }
    console.log(`   Blocked: ${dupBlocked}/20`);
    const dupOk = dupBlocked === 20;

    console.log("\n── Stage 5: Admin cancel → re-apply (assigned mon players) ──\n");
    let reapplyOk = 0;
    let reapplyTried = 0;
    const monSlotIds = new Set(
      (await supabase.from("slots").select("id").eq("day_of_week", "mon")).data?.map(
        (s) => s.id
      ) ?? []
    );
    const reapplySample = testPlayers.filter((p) => p.days.includes("mon"));
    for (const p of reapplySample) {
      if (reapplyTried >= 5) break;
      const { data: monRes } = await supabase
        .from("reservations")
        .select("id, slot_id")
        .eq("player_id", p.gameId)
        .eq("cycle_id", cycleId)
        .eq("status", "assigned")
        .not("slot_id", "is", null);
      const toCancel = (monRes ?? []).find((r) => monSlotIds.has(r.slot_id!));
      if (!toCancel) continue;
      reapplyTried++;

      await supabase
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("id", toCancel.id);

      const r = await processReservation(supabase, {
        gameId: p.gameId,
        name: p.name,
        alliance: p.alliance,
        dayOfWeek: "mon",
        speedup: p.speedup.mon + 5,
        preferredBlocks: p.prefs.mon.length ? p.prefs.mon : [2],
      });
      if (r.success) reapplyOk++;
    }
    console.log(`   Re-applied after cancel: ${reapplyOk}/${reapplyTried}`);

    console.log("\n── Stage 6: Hot block Monday 12 UTC (top-4 speedup) ──\n");
    const { data: hotAssigned } = await supabase
      .from("reservations")
      .select(
        "player_id, applied_at, players(name, speedup_vp), slots(slot_index)"
      )
      .eq("cycle_id", cycleId)
      .eq("status", "assigned");
    const hot = (hotAssigned ?? [])
      .filter((r) => {
        const s = r.slots as { day_of_week: string; block_start_utc: number; slot_index: number } | null;
        return s?.day_of_week === "mon" && s?.block_start_utc === 12;
      })
      .sort(
        (a, b) =>
          ((a.slots as { slot_index: number }).slot_index ?? 0) -
          ((b.slots as { slot_index: number }).slot_index ?? 0)
      );
    if (hot.length === 0) {
      console.log("   (no assignments on Mon block 12 UTC — players fell back to other blocks)");
    } else {
      hot.forEach((r, i) => {
        const pl = r.players as { name: string; speedup_vp: number };
        console.log(
          `   slot ${i + 1}: ${pl?.name} VP=${pl?.speedup_vp} applied=${r.applied_at?.slice(11, 19)}`
        );
      });
    }

    const reportPath = resolve(root, "scripts/test-150-report.txt");
    const summary = [
      `150-player test @ ${new Date().toISOString()}`,
      `submit ok/partial=${submitOk + submitPartial} fail=${submitFail}`,
      `integrity ${checksPassed}/${checks.length}`,
      `duplicate block ${dupBlocked}/20`,
      `reapply after cancel ${reapplyOk}/${reapplyTried}`,
    ].join("\n");
    writeFileSync(reportPath, summary);
    console.log(`\n📄 Report: ${reportPath}`);

    const allOk =
      checks.every((c) => c.ok) &&
      dupOk &&
      reapplyTried >= 4 &&
      reapplyOk >= reapplyTried - 1 &&
      submitFail <= 8;

    console.log("\n═══════════════════════════════════════════════════════════");
    if (allOk) {
      console.log("  ✅ OVERALL: 150-player simulation PASSED");
    } else {
      console.log("  ⚠️  OVERALL: completed with some warnings (see above)");
    }
    console.log("═══════════════════════════════════════════════════════════\n");
  } finally {
    await supabase
      .from("settings")
      .upsert({ key: "current_cycle_id", value: String(originalCycle) });
    await cleanup();
    console.log("🧹 Cycle restored & test data removed.\n");
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
