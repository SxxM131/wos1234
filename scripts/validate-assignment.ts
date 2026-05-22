#!/usr/bin/env npx tsx
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getCurrentCycleId,
  getLastAssignmentRun,
  computeEligibleByBlock,
  type BatchApplicant,
} from "../lib/assignment";
import { DayOfWeek, DAY_CONFIG } from "../lib/types";

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

const DAYS: DayOfWeek[] = ["mon", "tue", "thu"];

async function main() {
  const cycleId = await getCurrentCycleId(supabase);
  const lastRun = await getLastAssignmentRun(supabase);
  console.log(`Cycle #${cycleId}`);
  console.log(`last_assignment_run: ${lastRun ?? "(never)"}\n`);

  const hardErrors: string[] = [];
  const warnings: string[] = [];

  for (const day of DAYS) {
    const config = DAY_CONFIG[day];
    const { data: daySlots } = await supabase
      .from("slots")
      .select("id, block_start_utc, slot_index")
      .eq("day_of_week", day)
      .eq("is_active", true);

    const slotList = daySlots ?? [];
    const slotIds = slotList.map((s) => s.id);

    const { data: assigned } = await supabase
      .from("reservations")
      .select("id, player_id, slot_id")
      .eq("cycle_id", cycleId)
      .eq("status", "assigned")
      .in("slot_id", slotIds);

    const assignedList = assigned ?? [];
    const slotIdList = assignedList.map((r) => r.slot_id);
    const dupSlots = slotIdList.filter(
      (id, i) => slotIdList.indexOf(id) !== i
    );
    if (dupSlots.length) {
      hardErrors.push(`${day}: duplicate slot bookings`);
    }

    const playerIds = assignedList.map((r) => r.player_id);
    const dupPlayers = playerIds.filter(
      (id, i) => playerIds.indexOf(id) !== i
    );
    if (dupPlayers.length) {
      hardErrors.push(`${day}: same player in multiple slots`);
    }

    const { data: prefs } = await supabase
      .from("preferences")
      .select(
        "player_id, block_start_utc, players(speedup_vp, speedup_mo, created_at)"
      )
      .eq("cycle_id", cycleId)
      .eq("day_of_week", day);

    const applicantMap = new Map<number, BatchApplicant>();
    for (const row of prefs ?? []) {
      const p = row.players as {
        speedup_vp: number;
        speedup_mo: number;
        created_at: string;
      };
      const speedup = p[config.speedupKey];
      const existing = applicantMap.get(row.player_id);
      if (existing) {
        existing.blocks.add(row.block_start_utc);
      } else {
        applicantMap.set(row.player_id, {
          playerId: row.player_id,
          speedup,
          appliedAt: p.created_at,
          blocks: new Set([row.block_start_utc]),
        });
      }
    }

    const eligible = computeEligibleByBlock(applicantMap, slotList);
    for (const r of assignedList) {
      const slot = slotList.find((s) => s.id === r.slot_id);
      if (!slot) {
        hardErrors.push(`${day}: assigned row references missing slot`);
        continue;
      }
      if (!eligible.get(slot.block_start_utc)?.has(r.player_id)) {
        hardErrors.push(
          `${day}: player ${r.player_id} in block ${slot.block_start_utc} UTC but not top-4 eligible`
        );
      }
    }

    const assignedSet = new Set(playerIds);
    const applicantSet = new Set(applicantMap.keys());
    const { data: elim } = await supabase
      .from("reservations")
      .select("id, player_id")
      .eq("cycle_id", cycleId)
      .eq("status", "eliminated")
      .is("slot_id", null);

    const elimForDay = (elim ?? []).filter((e) => applicantSet.has(e.player_id));
    const both = new Set(
      elimForDay.filter((e) => assignedSet.has(e.player_id)).map((e) => e.player_id)
    );
    if (both.size) {
      hardErrors.push(
        `${day}: ${both.size} players have BOTH assigned and eliminated rows`
      );
    }

    const elimIds = new Set(elimForDay.map((e) => e.player_id));
    const missingStatus = [...applicantSet].filter(
      (id) => !assignedSet.has(id) && !elimIds.has(id)
    );
    if (missingStatus.length) {
      hardErrors.push(
        `${day}: ${missingStatus.length} applicants with no assigned/eliminated row`
      );
    }

    const extraElim = (elim ?? []).filter((e) => !applicantSet.has(e.player_id));
    if (extraElim.length) {
      warnings.push(`${day}: ${extraElim.length} orphan eliminated rows`);
    }

    const emptySlots = 48 - assignedList.length;
    let emptyWithTop4Waitlist = 0;
    for (const slot of slotList) {
      if (assignedList.some((r) => r.slot_id === slot.id)) continue;
      const elig = eligible.get(slot.block_start_utc);
      if (!elig) continue;
      const couldFill = [...elig].some((id) => !assignedSet.has(id));
      if (couldFill) emptyWithTop4Waitlist++;
    }

    console.log(`── ${config.label} ──`);
    console.log(`  Applicants: ${applicantSet.size}`);
    console.log(`  Assigned: ${assignedList.length} / 48 slots`);
    console.log(`  Empty slots: ${emptySlots}`);
    console.log(
      `  Waitlist (has prefs, no slot): ${[...applicantSet].filter((id) => !assignedSet.has(id)).length}`
    );
    console.log(
      `  Empty slots fillable by top-4 waitlist (design): ${emptyWithTop4Waitlist}`
    );
    console.log(
      `  Empty but only lower-ranked waitlist wanted block: ${emptySlots - emptyWithTop4Waitlist} (expected)`
    );
  }

  console.log("\n═══ Verdict ═══");
  if (!lastRun) {
    console.log("⚠ Batch assignment has NOT been run (no last_assignment_run).");
  }
  if (hardErrors.length === 0) {
    console.log("✅ Hard rules OK: no double booking, top-4 eligibility, clean status rows.");
  } else {
    console.log(`❌ ${hardErrors.length} hard rule violation(s):`);
    hardErrors.forEach((e) => console.log(`   • ${e}`));
  }
  if (warnings.length) {
    console.log(`\n⚠ ${warnings.length} warning(s):`);
    warnings.forEach((w) => console.log(`   • ${w}`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
