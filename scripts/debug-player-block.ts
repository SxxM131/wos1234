#!/usr/bin/env npx tsx
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getCurrentCycleId,
  computeEligibleByBlock,
  compareBatchApplicants,
  type BatchApplicant,
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

const gameId = parseInt(process.argv[2] ?? "300012", 10);
const day = (process.argv[3] ?? "mon") as "mon" | "tue" | "thu";
const block = parseInt(process.argv[4] ?? "0", 10);

async function main() {
  const cycleId = await getCurrentCycleId(supabase);

  const { data: daySlots } = await supabase
    .from("slots")
    .select("id, block_start_utc, slot_index")
    .eq("day_of_week", day)
    .eq("is_active", true);

  const blockSlots = (daySlots ?? []).filter((s) => s.block_start_utc === block);
  const { data: assigned } = await supabase
    .from("reservations")
    .select("player_id, slot_id, players(name, speedup_vp)")
    .eq("cycle_id", cycleId)
    .eq("status", "assigned")
    .in(
      "slot_id",
      blockSlots.map((s) => s.id)
    );

  const { data: prefs } = await supabase
    .from("preferences")
    .select(
      "player_id, block_start_utc, players(name, speedup_vp, created_at)"
    )
    .eq("cycle_id", cycleId)
    .eq("day_of_week", day);

  const applicantMap = new Map<number, BatchApplicant & { name: string }>();
  for (const row of prefs ?? []) {
    const p = row.players as {
      name: string;
      speedup_vp: number;
      created_at: string;
    };
    const existing = applicantMap.get(row.player_id);
    if (existing) {
      existing.blocks.add(row.block_start_utc);
    } else {
      applicantMap.set(row.player_id, {
        playerId: row.player_id,
        name: p.name,
        speedup: p.speedup_vp,
        appliedAt: p.created_at,
        blocks: new Set([row.block_start_utc]),
      });
    }
  }

  const eligible = computeEligibleByBlock(
    applicantMap,
    daySlots ?? []
  );
  const top4 = eligible.get(block);
  const ranked = [...applicantMap.values()]
    .filter((a) => a.blocks.has(block))
    .sort((a, b) => compareBatchApplicants(a, b));

  const { data: allRes } = await supabase
    .from("reservations")
    .select("status, slot_id, slots(block_start_utc, slot_index)")
    .eq("cycle_id", cycleId)
    .eq("player_id", gameId);

  console.log(`Cycle #${cycleId} · ${day} · block ${block} UTC · player ${gameId}\n`);
  console.log("Assigned in this block:");
  for (const r of assigned ?? []) {
    const slot = blockSlots.find((s) => s.id === r.slot_id);
    console.log(
      `  ${(r.players as { name: string }).name} SU${(r.players as { speedup_vp: number }).speedup_vp}d slot_index ${slot?.slot_index}`
    );
  }
  console.log(`Empty: ${4 - (assigned?.length ?? 0)} / 4\n`);

  console.log("Ranked applicants who preferred this block:");
  ranked.forEach((a, i) => {
    const mark =
      a.playerId === gameId
        ? "  << TARGET"
        : top4?.has(a.playerId)
          ? "  (top-4)"
          : "";
    console.log(`  ${i + 1}. ${a.name} ${a.speedup}d${mark}`);
  });

  const target = applicantMap.get(gameId);
  console.log("\nTarget player:");
  console.log("  prefs blocks:", target ? [...target.blocks].sort((a, b) => a - b) : "none");
  console.log("  top-4 for block 0?", top4?.has(gameId) ?? false);
  console.log("  reservations:", allRes);
}

main();
