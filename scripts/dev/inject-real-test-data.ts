#!/usr/bin/env npx tsx
/**
 * Inject specific test data to verify the 2nd-pass matching logic (e.g. buildSecondPassEdges).
 * Creates a scenario where a player is eliminated from a full block (10:00) but has preferred
 * another block (12:00) which has empty slots.
 * Under the corrected logic, this player must be assigned to the empty slot in block 12:00 during the 2nd pass.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  processMultiDayReservation,
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
  console.log(`Current Cycle ID: ${cycleId}`);

  // We will insert 6 testers to verify the 2nd pass matching behavior.
  // We use player_ids 990001 - 990006 to avoid conflicts.
  const testData = [
    {
      playerId: 990001,
      name: "테스터_A_100",
      alliance: "WOS",
      dayInputs: [{ dayOfWeek: "mon" as const, speedup: 100, preferredBlocks: [10] }],
    },
    {
      playerId: 990002,
      name: "테스터_B_90",
      alliance: "WOS",
      dayInputs: [{ dayOfWeek: "mon" as const, speedup: 90, preferredBlocks: [10] }],
    },
    {
      playerId: 990003,
      name: "테스터_C_80",
      alliance: "WOS",
      dayInputs: [{ dayOfWeek: "mon" as const, speedup: 80, preferredBlocks: [10] }],
    },
    {
      playerId: 990004,
      name: "테스터_D_70",
      alliance: "WOS",
      dayInputs: [{ dayOfWeek: "mon" as const, speedup: 70, preferredBlocks: [10] }],
    },
    {
      playerId: 990005,
      name: "테스터_E_50", // Preferred both 10 and 12. Block 10 will be full. Must go to Block 12 in 2nd pass.
      alliance: "WOS",
      dayInputs: [{ dayOfWeek: "mon" as const, speedup: 50, preferredBlocks: [10, 12] }],
    },
    {
      playerId: 990006,
      name: "테스터_F_60",
      alliance: "WOS",
      dayInputs: [{ dayOfWeek: "mon" as const, speedup: 60, preferredBlocks: [12] }],
    },
  ];

  console.log("Setting reservation_open to true...");
  await supabase
    .from("settings")
    .upsert({ key: "reservation_open", value: "true" });

  console.log("Injecting test reservation applications...");

  for (const item of testData) {
    const res = await processMultiDayReservation(
      supabase,
      item.playerId,
      item.name,
      item.alliance,
      item.dayInputs
    );

    if (res.success) {
      console.log(`  ✓ ${item.name} (Player ID: ${item.playerId}) submitted successfully.`);
    } else {
      console.log(`  ✗ ${item.name} (Player ID: ${item.playerId}) failed: ${res.message}`);
    }
  }

  console.log("\n=========================================================");
  console.log("Test data injection complete!");
  console.log("Please run batch assignment on your admin dashboard or via terminal command.");
  console.log("\nExpected Results (Monday):");
  console.log(" - Block 10: 테스터_A_100, 테스터_B_90, 테스터_C_80, 테스터_D_70 assigned.");
  console.log(" - Block 12: 테스터_F_60, 테스터_E_50 assigned (E must be assigned to 12 via 2nd-pass!).");
  console.log("=========================================================");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
