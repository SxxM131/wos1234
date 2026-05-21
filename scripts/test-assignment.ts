import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  processReservation,
  processMultiDayReservation,
  promoteOnCancel,
} from "../lib/assignment";
import { DUPLICATE_DAY_MESSAGE } from "../lib/reservation-guard";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env variables
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
const testPlayerIds = [9001, 9002, 9003, 9004, 9005, 9052, 9099, 9010, 9011];

async function cleanup() {
  console.log("🧹 Cleaning up test data...");
  // Delete test reservations
  await supabase.from("reservations").delete().eq("cycle_id", TEST_CYCLE);
  // Delete test preferences
  await supabase.from("preferences").delete().eq("cycle_id", TEST_CYCLE);
  // Delete test players
  await supabase.from("players").delete().in("game_id", testPlayerIds);
}

async function runTests() {
  // Get original cycle id
  const { data: origCycleSetting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "current_cycle_id")
    .single();
  const originalCycle = origCycleSetting?.value ?? "1";

  try {
    // Set cycle to 9999
    await supabase
      .from("settings")
      .upsert({ key: "current_cycle_id", value: String(TEST_CYCLE) });

    await cleanup();

    console.log("\n==========================================");
    console.log("🧪 RUNNING SCENARIO 1: 5 players on same block (Block 0 UTC, Monday)");
    console.log("==========================================");
    
    // Players:
    // P1: speedup 10, pref [0]
    // P2: speedup 20, pref [0]
    // P3: speedup 30, pref [0]
    // P4: speedup 40, pref [0]
    // P5: speedup 50, pref [0]
    // Submit in order: P1, P2, P3, P4, P5.
    // Monday block 0 has 4 slots (indices 0, 1, 2, 3).
    // Expected outcome: P5, P4, P3, P2 are assigned. P1 is eliminated.
    
    const players = [
      { id: 9001, name: "P1_10", speedup: 10, pref: [0] },
      { id: 9002, name: "P2_20", speedup: 20, pref: [0] },
      { id: 9003, name: "P3_30", speedup: 30, pref: [0] },
      { id: 9004, name: "P4_40", speedup: 40, pref: [0] },
      { id: 9005, name: "P5_50", speedup: 50, pref: [0] },
    ];

    for (const p of players) {
      console.log(`Submitting reservation for ${p.name}...`);
      const res = await processReservation(supabase, {
        gameId: p.id,
        name: p.name,
        alliance: "TEST_ALLIANCE",
        dayOfWeek: "mon",
        speedup: p.speedup,
        preferredBlocks: p.pref,
      });
      console.log(` -> Result: ${res.success ? "Success" : "Failed"} - ${res.message}`);
    }

    // Verify reservations in DB
    const { data: resS1 } = await supabase
      .from("reservations")
      .select("player_id, status, slot_id, slots(slot_index)")
      .eq("cycle_id", TEST_CYCLE);

    console.log("\nReservation Statuses in DB after Scenario 1:");
    console.log(JSON.stringify(resS1, null, 2));

    // Asserts:
    const assignedIds = resS1?.filter((r) => r.status === "assigned").map((r) => r.player_id) || [];
    const eliminatedIds = resS1?.filter((r) => r.status === "eliminated").map((r) => r.player_id) || [];

    const ok1 = assignedIds.includes(9002) && assignedIds.includes(9003) && assignedIds.includes(9004) && assignedIds.includes(9005);
    const ok2 = eliminatedIds.includes(9001);

    if (ok1 && ok2) {
      console.log("✅ Scenario 1 Passed!");
    } else {
      console.error("❌ Scenario 1 Failed!");
    }

    console.log("\n==========================================");
    console.log("🧪 RUNNING SCENARIO 2: Fallback to 2nd preference on displacement");
    console.log("==========================================");
    // Let's reset and run Scenario 2
    // Setup:
    // P1 (10, pref [0, 2])
    // P2 (20, pref [0])
    // P3 (30, pref [0])
    // P4 (40, pref [0])
    // All 4 fit in block 0 initially.
    // Then P5 (50, pref [0]) applies, which displaces P1.
    // P1 has 2nd preference block 2. Since block 2 is empty, P1 should fall back and be assigned to block 2.
    
    await cleanup();

    const pS2 = [
      { id: 9001, name: "P1_10", speedup: 10, pref: [0, 2] },
      { id: 9002, name: "P2_20", speedup: 20, pref: [0] },
      { id: 9003, name: "P3_30", speedup: 30, pref: [0] },
      { id: 9004, name: "P4_40", speedup: 40, pref: [0] },
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

    console.log("Before P5 applies: P1, P2, P3, P4 are in block 0.");
    const { data: beforeP5 } = await supabase
      .from("reservations")
      .select("player_id, status, slot_id, slots(block_start_utc)")
      .eq("cycle_id", TEST_CYCLE);
    console.log(JSON.stringify(beforeP5, null, 2));

    console.log("Applying P5 (50, pref [0])...");
    await processReservation(supabase, {
      gameId: 9005,
      name: "P5_50",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 50,
      preferredBlocks: [0],
    });

    console.log("After P5 applies: check if P1 (10) fell back to block 2.");
    const { data: afterP5 } = await supabase
      .from("reservations")
      .select("player_id, status, slot_id, slots(block_start_utc)")
      .eq("cycle_id", TEST_CYCLE);
    console.log(JSON.stringify(afterP5, null, 2));

    const p1Res = afterP5?.find((r) => r.player_id === 9001);
    const p1Block = (p1Res?.slots as any)?.block_start_utc;

    if (p1Res && p1Res.status === "assigned" && p1Block === 2) {
      console.log("✅ Scenario 2 Passed! P1 fell back to block 2.");
    } else {
      console.error(`❌ Scenario 2 Failed! P1 status is: ${p1Res?.status}, block: ${p1Block}`);
    }

    console.log("\n==========================================");
    console.log("🧪 RUNNING SCENARIO 3: Automatic promotion on cancel");
    console.log("==========================================");
    // Setup:
    // P5 (50), P4 (40), P3 (30), P2 (20) are assigned to block 0.
    // P1 (10, pref [0]) is eliminated (since it has only pref [0]).
    
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

    // Check status
    const { data: s3Initial } = await supabase
      .from("reservations")
      .select("id, player_id, status, slot_id")
      .eq("cycle_id", TEST_CYCLE);
    console.log("Initial state for S3:");
    console.log(JSON.stringify(s3Initial, null, 2));

    // Cancel P2's reservation
    const p2Res = s3Initial?.find((r) => r.player_id === 9002);
    if (!p2Res || !p2Res.slot_id) {
      throw new Error("Could not find assigned slot for P2");
    }

    console.log(`Cancelling reservation for P2 (ID: ${p2Res.id}, slot: ${p2Res.slot_id})...`);
    // Delete P2 reservation (representing a cancel)
    await supabase.from("reservations").delete().eq("id", p2Res.id);

    // Call promotion
    console.log("Triggering promoteOnCancel...");
    await promoteOnCancel(supabase, p2Res.slot_id, TEST_CYCLE);

    // Verify
    const { data: s3Final } = await supabase
      .from("reservations")
      .select("player_id, status, slot_id")
      .eq("cycle_id", TEST_CYCLE);
    console.log("Final state for S3:");
    console.log(JSON.stringify(s3Final, null, 2));

    const p1S3Final = s3Final?.find((r) => r.player_id === 9001);
    if (p1S3Final && p1S3Final.status === "assigned" && p1S3Final.slot_id === p2Res.slot_id) {
      console.log("✅ Scenario 3 Passed! P1 promoted to slot successfully.");
    } else {
      console.error("❌ Scenario 3 Failed! P1 was not promoted.");
    }

    console.log("\n==========================================");
    console.log(
      "🧪 RUNNING SCENARIO 4: Multi-day — Monday displacement must not wipe Thursday"
    );
    console.log("==========================================");

    await cleanup();

    const multiRes = await processMultiDayReservation(
      supabase,
      9052,
      "MultiDay_Player",
      "TEST",
      [
        { dayOfWeek: "mon", speedup: 30, preferredBlocks: [0] },
        { dayOfWeek: "thu", speedup: 40, preferredBlocks: [4] },
      ]
    );
    console.log(`Multi-day submit: ${multiRes.message}`);

    const { data: afterMulti } = await supabase
      .from("reservations")
      .select("player_id, status, slot_id, slots(day_of_week, block_start_utc)")
      .eq("cycle_id", TEST_CYCLE)
      .eq("player_id", 9052);

    const thuAssignedBefore = afterMulti?.some((r) => {
      const slots = r.slots as unknown as { day_of_week: string } | null;
      return r.status === "assigned" && slots?.day_of_week === "thu";
    });
    console.log("9052 Thursday assigned before displacement:", thuAssignedBefore);

    await processReservation(supabase, {
      gameId: 9099,
      name: "Displacer",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 99,
      preferredBlocks: [0],
    });

    const { data: afterDisplace } = await supabase
      .from("reservations")
      .select("player_id, status, slot_id, slots(day_of_week, block_start_utc)")
      .eq("cycle_id", TEST_CYCLE)
      .in("player_id", [9052, 9099]);

    console.log(JSON.stringify(afterDisplace, null, 2));

    const thuStillAssigned = afterDisplace?.some((r) => {
      const slots = r.slots as unknown as { day_of_week: string } | null;
      return (
        r.player_id === 9052 &&
        r.status === "assigned" &&
        slots?.day_of_week === "thu"
      );
    });
    const monDisplacerAssigned = afterDisplace?.some((r) => {
      const slots = r.slots as unknown as { day_of_week: string } | null;
      return (
        r.player_id === 9099 &&
        r.status === "assigned" &&
        slots?.day_of_week === "mon"
      );
    });

    if (thuStillAssigned && monDisplacerAssigned) {
      console.log(
        "✅ Scenario 4 Passed! Thursday reservation survived Monday displacement."
      );
    } else {
      console.error(
        `❌ Scenario 4 Failed! thuStillAssigned=${thuStillAssigned}, monDisplacerAssigned=${monDisplacerAssigned}`
      );
    }

    console.log("\n==========================================");
    console.log("🧪 RUNNING SCENARIO 5: Re-submit same day is rejected");
    console.log("==========================================");
    await cleanup();

    const first = await processReservation(supabase, {
      gameId: 9010,
      name: "NoResubmit",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 25,
      preferredBlocks: [0],
    });
    console.log("First submit:", first.message);

    const second = await processReservation(supabase, {
      gameId: 9010,
      name: "NoResubmit",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 99,
      preferredBlocks: [2],
    });
    console.log("Second submit:", second.message);

    const ok5 =
      first.success &&
      !second.success &&
      second.message.includes(DUPLICATE_DAY_MESSAGE);
    if (ok5) {
      console.log("✅ Scenario 5 Passed! Duplicate day rejected.");
    } else {
      console.error("❌ Scenario 5 Failed!");
    }

    console.log("\n==========================================");
    console.log("🧪 SCENARIO 6: Re-submit after admin cancel");
    console.log("==========================================");
    await cleanup();

    await processReservation(supabase, {
      gameId: 9011,
      name: "ReAfterCancel",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 20,
      preferredBlocks: [0],
    });

    const { data: firstRes } = await supabase
      .from("reservations")
      .select("id, slot_id")
      .eq("player_id", 9011)
      .eq("cycle_id", TEST_CYCLE)
      .eq("status", "assigned")
      .limit(1)
      .single();

    if (firstRes?.id) {
      await supabase
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("id", firstRes.id);
    }

    const afterCancel = await processReservation(supabase, {
      gameId: 9011,
      name: "ReAfterCancel",
      alliance: "TEST",
      dayOfWeek: "mon",
      speedup: 30,
      preferredBlocks: [2],
    });

    if (afterCancel.success) {
      console.log("✅ Scenario 6 Passed! Re-apply after cancel allowed.");
    } else {
      console.error("❌ Scenario 6 Failed!", afterCancel.message);
    }

  } finally {
    // Restore original cycle ID
    console.log(`\nRestoring original cycle ID: ${originalCycle}`);
    await supabase
      .from("settings")
      .upsert({ key: "current_cycle_id", value: originalCycle });
    await cleanup();
  }
}

runTests().catch(console.error);
