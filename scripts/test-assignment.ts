import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  processReservation,
  processMultiDayReservation,
  promoteOnCancel,
  runBatchAssignment,
  saveLastAssignmentRun,
  solveDayAssignment,
  type BatchApplicant,
  type DaySlotRow,
} from "../lib/assignment";

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
const testPlayerIds = [
  9001, 9002, 9003, 9004, 9005, 9052, 9099, 9010, 9011, 9020, 9021, 9022,
  9101, 9102, 9103, 9104, 9105, 9106,
];

async function cleanup() {
  console.log("🧹 Cleaning up test data...");
  await supabase.from("reservations").delete().eq("cycle_id", TEST_CYCLE);
  await supabase.from("preferences").delete().eq("cycle_id", TEST_CYCLE);
  await supabase.from("players").delete().in("game_id", testPlayerIds);
  await supabase.from("settings").delete().eq("key", "last_assignment_run");
}

async function batchAssign(day: "mon" | "tue" | "thu") {
  return runBatchAssignment(supabase, TEST_CYCLE, day);
}

async function runTests() {
  const { data: origCycleSetting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "current_cycle_id")
    .single();
  const originalCycle = origCycleSetting?.value ?? "1";

  try {
    await supabase
      .from("settings")
      .upsert({ key: "current_cycle_id", value: String(TEST_CYCLE) });

    await cleanup();

    console.log("\n==========================================");
    console.log(
      "🧪 SCENARIO 1: 5 players on same block (Block 0 UTC, Monday)"
    );
    console.log("==========================================");

    const players = [
      { id: 9001, name: "P1_10", speedup: 10, pref: [0] },
      { id: 9002, name: "P2_20", speedup: 20, pref: [0] },
      { id: 9003, name: "P3_30", speedup: 30, pref: [0] },
      { id: 9004, name: "P4_40", speedup: 40, pref: [0] },
      { id: 9005, name: "P5_50", speedup: 50, pref: [0] },
    ];

    for (const p of players) {
      const res = await processReservation(supabase, {
        gameId: p.id,
        name: p.name,
        alliance: "TEST_ALLIANCE",
        dayOfWeek: "mon",
        speedup: p.speedup,
        preferredBlocks: p.pref,
      });
      console.log(
        ` -> ${p.name}: ${res.success ? "Success" : "Failed"} - ${res.message}`
      );
    }

    await batchAssign("mon");

    const { data: resS1 } = await supabase
      .from("reservations")
      .select("player_id, status, slot_id, slots(slot_index)")
      .eq("cycle_id", TEST_CYCLE);

    const assignedIds =
      resS1?.filter((r) => r.status === "assigned").map((r) => r.player_id) ||
      [];
    const eliminatedIds =
      resS1?.filter((r) => r.status === "eliminated").map((r) => r.player_id) ||
      [];

    const ok1 =
      assignedIds.includes(9002) &&
      assignedIds.includes(9003) &&
      assignedIds.includes(9004) &&
      assignedIds.includes(9005);
    const ok2 = eliminatedIds.includes(9001);

    if (ok1 && ok2) console.log("✅ Scenario 1 Passed!");
    else console.error("❌ Scenario 1 Failed!");

    console.log("\n==========================================");
    console.log("🧪 SCENARIO 2: Fallback to 2nd preference block");
    console.log("==========================================");

    await cleanup();

    const pS2 = [
      { id: 9001, name: "P1_10", speedup: 10, pref: [0, 2] },
      { id: 9002, name: "P2_20", speedup: 20, pref: [0] },
      { id: 9003, name: "P3_30", speedup: 30, pref: [0] },
      { id: 9004, name: "P4_40", speedup: 40, pref: [0] },
      { id: 9005, name: "P5_50", speedup: 50, pref: [0] },
    ];

    for (const p of pS2) {
      await processReservation(supabase, {
        gameId: p.id,
        name: p.name,
        alliance: "TEST",
        dayOfWeek: "mon",
        speedup: p.speedup,
        preferredBlocks: p.pref,
      });
    }

    await batchAssign("mon");

    const { data: afterBatch } = await supabase
      .from("reservations")
      .select("player_id, status, slot_id, slots(block_start_utc)")
      .eq("cycle_id", TEST_CYCLE);

    const p1Res = afterBatch?.find((r) => r.player_id === 9001);
    const p1Block = (p1Res?.slots as { block_start_utc: number })?.block_start_utc;

    if (p1Res?.status === "assigned" && p1Block === 2) {
      console.log("✅ Scenario 2 Passed! P1 assigned to block 2.");
    } else {
      console.error(
        `❌ Scenario 2 Failed! P1 status=${p1Res?.status}, block=${p1Block}`
      );
    }

    console.log("\n==========================================");
    console.log("🧪 SCENARIO 3: Automatic promotion on cancel");
    console.log("==========================================");

    await cleanup();
    const pS3 = [
      { id: 9001, name: "P1_10", speedup: 10, pref: [0] },
      { id: 9002, name: "P2_20", speedup: 20, pref: [0] },
      { id: 9003, name: "P3_30", speedup: 30, pref: [0] },
      { id: 9004, name: "P4_40", speedup: 40, pref: [0] },
      { id: 9005, name: "P5_50", speedup: 50, pref: [0] },
    ];

    for (const p of pS3) {
      await processReservation(supabase, {
        gameId: p.id,
        name: p.name,
        alliance: "TEST",
        dayOfWeek: "mon",
        speedup: p.speedup,
        preferredBlocks: p.pref,
      });
    }

    await batchAssign("mon");
    await saveLastAssignmentRun(supabase, new Date().toISOString());

    const { data: s3Initial } = await supabase
      .from("reservations")
      .select("id, player_id, status, slot_id")
      .eq("cycle_id", TEST_CYCLE);

    const p2Res = s3Initial?.find(
      (r) => r.player_id === 9002 && r.status === "assigned"
    );
    if (!p2Res?.slot_id) throw new Error("Could not find assigned slot for P2");

    await supabase
      .from("reservations")
      .update({ status: "cancelled" })
      .eq("id", p2Res.id);

    await promoteOnCancel(supabase, p2Res.slot_id, TEST_CYCLE);

    const { data: s3Final } = await supabase
      .from("reservations")
      .select("player_id, status, slot_id")
      .eq("cycle_id", TEST_CYCLE)
      .eq("status", "assigned");

    const p1S3Final = s3Final?.find((r) => r.player_id === 9001);
    if (p1S3Final?.slot_id === p2Res.slot_id) {
      console.log("✅ Scenario 3 Passed! P1 promoted to slot successfully.");
    } else {
      console.error("❌ Scenario 3 Failed! P1 was not promoted.");
    }

    console.log("\n==========================================");
    console.log(
      "🧪 SCENARIO 4: Multi-day — Monday batch must not wipe Thursday"
    );
    console.log("==========================================");

    await cleanup();

    await processMultiDayReservation(supabase, 9052, "MultiDay_Player", "TEST", [
      { dayOfWeek: "mon", speedup: 30, preferredBlocks: [0] },
      { dayOfWeek: "thu", speedup: 40, preferredBlocks: [4] },
    ]);

    await batchAssign("mon");
    await batchAssign("thu");

    await processReservation(supabase, {
      gameId: 9099,
      name: "Displacer",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 99,
      preferredBlocks: [0],
    });

    await batchAssign("mon");

    const { data: afterDisplace } = await supabase
      .from("reservations")
      .select("player_id, status, slot_id, slots(day_of_week, block_start_utc)")
      .eq("cycle_id", TEST_CYCLE)
      .in("player_id", [9052, 9099])
      .eq("status", "assigned");

    const thuStillAssigned = afterDisplace?.some((r) => {
      const slots = r.slots as { day_of_week: string };
      return r.player_id === 9052 && slots?.day_of_week === "thu";
    });
    const monDisplacerAssigned = afterDisplace?.some((r) => {
      const slots = r.slots as { day_of_week: string };
      return r.player_id === 9099 && slots?.day_of_week === "mon";
    });

    if (thuStillAssigned && monDisplacerAssigned) {
      console.log("✅ Scenario 4 Passed! Thursday survived Monday re-batch.");
    } else {
      console.error(
        `❌ Scenario 4 Failed! thu=${thuStillAssigned}, mon=${monDisplacerAssigned}`
      );
    }

    console.log("\n==========================================");
    console.log("🧪 SCENARIO 5: Maximum matching (5 players across two blocks)");
    console.log("==========================================");
    await cleanup();

    const block2 = 2;
    const block8 = 8;
    const s5Players = [
      { id: 9101, name: "A", speedup: 100, pref: [block2, block8] },
      { id: 9102, name: "B", speedup: 80, pref: [block2] },
      { id: 9103, name: "C", speedup: 60, pref: [block2] },
      { id: 9104, name: "D", speedup: 40, pref: [block2] },
      { id: 9105, name: "E", speedup: 30, pref: [block2, block8] },
    ];

    for (const p of s5Players) {
      await processReservation(supabase, {
        gameId: p.id,
        name: p.name,
        alliance: "TEST",
        dayOfWeek: "mon",
        speedup: p.speedup,
        preferredBlocks: p.pref,
      });
    }

    await batchAssign("mon");

    const { data: s5Res } = await supabase
      .from("reservations")
      .select("player_id, status, slots(block_start_utc)")
      .eq("cycle_id", TEST_CYCLE)
      .eq("status", "assigned");

    const s5AssignedIds = new Set((s5Res ?? []).map((r) => r.player_id));
    const block2Ids = new Set(
      (s5Res ?? [])
        .filter(
          (r) =>
            (r.slots as { block_start_utc: number })?.block_start_utc === block2
        )
        .map((r) => r.player_id)
    );
    const block8Ids = new Set(
      (s5Res ?? [])
        .filter(
          (r) =>
            (r.slots as { block_start_utc: number })?.block_start_utc === block8
        )
        .map((r) => r.player_id)
    );

    const ok5 =
      s5AssignedIds.size === 5 &&
      block2Ids.size === 4 &&
      block2Ids.has(9101) &&
      block2Ids.has(9102) &&
      block2Ids.has(9103) &&
      block2Ids.has(9104) &&
      block8Ids.has(9105);

    if (ok5) console.log("✅ Scenario 5 Passed!");
    else {
      console.error(
        `❌ Scenario 5 Failed! total=${s5AssignedIds.size}, block2=${block2Ids.size}, block8=${block8Ids.size}`
      );
    }

    console.log("\n==========================================");
    console.log("🧪 SCENARIO 6: Eligibility — top 4 per block only");
    console.log("==========================================");
    await cleanup();

    await processReservation(supabase, {
      gameId: 9101,
      name: "A",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 100,
      preferredBlocks: [block2],
    });
    await processReservation(supabase, {
      gameId: 9102,
      name: "B",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 80,
      preferredBlocks: [block2],
    });
    await processReservation(supabase, {
      gameId: 9103,
      name: "C",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 60,
      preferredBlocks: [block2],
    });
    await processReservation(supabase, {
      gameId: 9104,
      name: "D",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 40,
      preferredBlocks: [block2],
    });
    await processReservation(supabase, {
      gameId: 9105,
      name: "E",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 30,
      preferredBlocks: [block2, block8],
    });
    await processReservation(supabase, {
      gameId: 9106,
      name: "F",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 20,
      preferredBlocks: [block2],
    });

    await batchAssign("mon");

    const { data: s6Res } = await supabase
      .from("reservations")
      .select("player_id, status, slots(block_start_utc)")
      .eq("cycle_id", TEST_CYCLE);

    const s6Assigned = (s6Res ?? []).filter((r) => r.status === "assigned");
    const s6Elim = (s6Res ?? []).filter((r) => r.status === "eliminated");
    const block2Assigned6 = s6Assigned.filter(
      (r) => (r.slots as { block_start_utc: number })?.block_start_utc === block2
    );
    const eAssignedElsewhere = s6Assigned.some((r) => r.player_id === 9105);
    const fEliminated = s6Elim.some((r) => r.player_id === 9106);

    const ok6 =
      block2Assigned6.length === 4 &&
      block2Assigned6.every((r) => [9101, 9102, 9103, 9104].includes(r.player_id)) &&
      fEliminated &&
      eAssignedElsewhere;

    if (ok6) console.log("✅ Scenario 6 Passed!");
    else console.error("❌ Scenario 6 Failed!", { block2Assigned6, fEliminated, eAssignedElsewhere });

    console.log("\n==========================================");
    console.log("🧪 SCENARIO 7: Block traversal order does not change matching");
    console.log("==========================================");

    const mockSlots: DaySlotRow[] = [
      { id: 1, block_start_utc: 2, slot_index: 0 },
      { id: 2, block_start_utc: 2, slot_index: 1 },
      { id: 3, block_start_utc: 2, slot_index: 2 },
      { id: 4, block_start_utc: 2, slot_index: 3 },
      { id: 5, block_start_utc: 8, slot_index: 0 },
      { id: 6, block_start_utc: 8, slot_index: 1 },
      { id: 7, block_start_utc: 8, slot_index: 2 },
      { id: 8, block_start_utc: 8, slot_index: 3 },
    ];

    const mockApplicants = new Map<number, BatchApplicant>([
      [
        9101,
        {
          playerId: 9101,
          speedup: 100,
          appliedAt: "2025-01-01T00:00:00Z",
          blocks: new Set([2, 8]),
        },
      ],
      [
        9102,
        {
          playerId: 9102,
          speedup: 80,
          appliedAt: "2025-01-01T01:00:00Z",
          blocks: new Set([2]),
        },
      ],
      [
        9103,
        {
          playerId: 9103,
          speedup: 60,
          appliedAt: "2025-01-01T02:00:00Z",
          blocks: new Set([2]),
        },
      ],
      [
        9104,
        {
          playerId: 9104,
          speedup: 40,
          appliedAt: "2025-01-01T03:00:00Z",
          blocks: new Set([2]),
        },
      ],
      [
        9105,
        {
          playerId: 9105,
          speedup: 30,
          appliedAt: "2025-01-01T04:00:00Z",
          blocks: new Set([2, 8]),
        },
      ],
    ]);

    const ascOrder = [2, 8];
    const descOrder = [8, 2];

    const matchAsc = solveDayAssignment(mockApplicants, mockSlots, ascOrder);
    const matchDesc = solveDayAssignment(mockApplicants, mockSlots, descOrder);

    const ascPlayers = Array.from(matchAsc.keys()).sort((a, b) => a - b);
    const descPlayers = Array.from(matchDesc.keys()).sort((a, b) => a - b);
    const samePlayers =
      ascPlayers.length === descPlayers.length &&
      ascPlayers.every((id, i) => id === descPlayers[i]);

    const ascSlots = Array.from(matchAsc.values()).sort((a, b) => a - b);
    const descSlots = Array.from(matchDesc.values()).sort((a, b) => a - b);
    const sameCount = matchAsc.size === matchDesc.size && matchAsc.size === 5;

    if (sameCount && samePlayers && ascSlots.length === descSlots.length) {
      console.log("✅ Scenario 7 Passed!");
    } else {
      console.error("❌ Scenario 7 Failed!", {
        ascPlayers,
        descPlayers,
        ascSize: matchAsc.size,
        descSize: matchDesc.size,
      });
    }
  } finally {
    console.log(`\nRestoring original cycle ID: ${originalCycle}`);
    await supabase
      .from("settings")
      .upsert({ key: "current_cycle_id", value: originalCycle });
    await cleanup();
  }
}

runTests().catch(console.error);
