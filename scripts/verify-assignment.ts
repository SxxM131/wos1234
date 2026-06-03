#!/usr/bin/env npx tsx
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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
  console.log("Starting verification...");

  let errors = 0;
  let warnings = 0;

  const { data: cycleData } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "current_cycle_id")
    .single();
  const cycleId = parseInt(cycleData?.value ?? "1", 10);

  const { data: slotsData } = await supabase.from("slots").select("*");
  const slots = slotsData ?? [];

  const { data: resData } = await supabase
    .from("reservations")
    .select("*")
    .eq("cycle_id", cycleId);
  const reservations = resData ?? [];

  const { data: prefData } = await supabase
    .from("preferences")
    .select("*")
    .eq("cycle_id", cycleId);
  const preferences = prefData ?? [];

  const { data: playersData } = await supabase.from("players").select("*");
  const players = playersData ?? [];

  const slotsById = new Map<number, any>();
  const activeSlotsByBlock = new Map<string, Map<number, any[]>>();

  for (const s of slots) {
    slotsById.set(s.id, s);
    if (s.is_active) {
      if (!activeSlotsByBlock.has(s.day_of_week)) {
        activeSlotsByBlock.set(s.day_of_week, new Map());
      }
      const dayMap = activeSlotsByBlock.get(s.day_of_week)!;
      if (!dayMap.has(s.block_start_utc)) {
        dayMap.set(s.block_start_utc, []);
      }
      dayMap.get(s.block_start_utc)!.push(s);
    }
  }

  const assigned = reservations.filter((r) => r.status === "assigned" && r.slot_id !== null);
  const seenElimPlayerIds = new Set<number>();
  const eliminated = reservations
    .filter((r) => r.status === "eliminated" && r.slot_id === null)
    .filter((r) => {
      if (seenElimPlayerIds.has(r.player_id)) return false;
      seenElimPlayerIds.add(r.player_id);
      return true;
    });

  const assignedByBlock = new Map<string, Map<number, any[]>>();
  const assignedByPlayerDay = new Map<number, Map<string, any[]>>();

  for (const r of assigned) {
    const slot = slotsById.get(r.slot_id);
    if (!slot) continue;

    if (!assignedByBlock.has(slot.day_of_week)) {
      assignedByBlock.set(slot.day_of_week, new Map());
    }
    const dayMap = assignedByBlock.get(slot.day_of_week)!;
    if (!dayMap.has(slot.block_start_utc)) {
      dayMap.set(slot.block_start_utc, []);
    }
    dayMap.get(slot.block_start_utc)!.push(r);

    if (!assignedByPlayerDay.has(r.player_id)) {
      assignedByPlayerDay.set(r.player_id, new Map());
    }
    const pMap = assignedByPlayerDay.get(r.player_id)!;
    if (!pMap.has(slot.day_of_week)) {
      pMap.set(slot.day_of_week, []);
    }
    pMap.get(slot.day_of_week)!.push(r);
  }

  const prefByPlayerDayBlock = new Map<number, Map<string, Set<number>>>();
  for (const p of preferences) {
    if (!prefByPlayerDayBlock.has(p.player_id)) {
      prefByPlayerDayBlock.set(p.player_id, new Map());
    }
    const dMap = prefByPlayerDayBlock.get(p.player_id)!;
    if (!dMap.has(p.day_of_week)) {
      dMap.set(p.day_of_week, new Set());
    }
    dMap.get(p.day_of_week)!.add(p.block_start_utc);
  }

  const playerMap = new Map<number, any>();
  for (const p of players) playerMap.set(p.game_id, p);

  function getSpeedup(playerId: number, day: string): number {
    const p = playerMap.get(playerId);
    if (!p) return 0;
    if (day === "mon") return p.speedup_mon;
    if (day === "tue") return p.speedup_tue;
    if (day === "thu") return p.speedup_thu;
    return 0;
  }

  for (const day of ["mon", "tue", "thu"]) {
    console.log(`\n--- [${day.toUpperCase()}] ---`);
    const daySlotsMap = activeSlotsByBlock.get(day) ?? new Map();
    const dayAssignedMap = assignedByBlock.get(day) ?? new Map();

    for (const [block, activeSlots] of daySlotsMap.entries()) {
      const assignedCount = dayAssignedMap.get(block)?.length ?? 0;
      const assignedList = dayAssignedMap.get(block) ?? [];

      // Find eliminated players who wanted this block and are not assigned on this day
      const elimWanted = eliminated.filter((e) => {
        const isAssignedOnDay = assignedByPlayerDay.get(e.player_id)?.has(day) ?? false;
        if (isAssignedOnDay) return false;
        const wants = prefByPlayerDayBlock.get(e.player_id)?.get(day)?.has(block);
        return wants;
      });

      // V1
      if (assignedCount < activeSlots.length && elimWanted.length > 0) {
        console.warn(
          `[경고] V1: ${day} 블록 ${block}에 빈 자리(${activeSlots.length - assignedCount}개)가 있지만 대기자(${elimWanted.length}명)가 존재합니다.`
        );
        warnings++;
      }

      // V4
      const applicantCount = assignedList.length + elimWanted.length;
      if (applicantCount >= activeSlots.length && assignedList.length > 0 && elimWanted.length > 0) {
        const assignedSpeedups = assignedList.map((r) => getSpeedup(r.player_id, day));
        const elimSpeedups = elimWanted.map((r) => getSpeedup(r.player_id, day));
        const minAssigned = Math.min(...assignedSpeedups);
        const maxElim = Math.max(...elimSpeedups);
        if (maxElim > minAssigned) {
          console.warn(
            `[경고] V4: ${day} 블록 ${block}에서 스피드업 역전 발생 (배정 최소: ${minAssigned}, 대기자 최대: ${maxElim})`
          );
          warnings++;
        }
      }
    }
  }

  console.log("\n--- [공통/전체 에러 체크] ---");

  // V2
  for (const [playerId, dayMap] of assignedByPlayerDay.entries()) {
    for (const [day, resList] of dayMap.entries()) {
      if (resList.length > 1) {
        console.error(
          `[에러] V2: 플레이어 ${playerId}가 ${day} 요일에 중복 배정(${resList.length}개)되었습니다.`
        );
        errors++;
      }
    }
  }

  // V3 & V5
  for (const r of assigned) {
    const slot = slotsById.get(r.slot_id);
    if (!slot) continue;

    // V3
    if (!slot.is_active) {
      console.error(`[에러] V3: 플레이어 ${r.player_id}가 비활성 슬롯(ID: ${slot.id})에 배정되었습니다.`);
      errors++;
    }

    // V5
    const hasPref = prefByPlayerDayBlock.get(r.player_id)?.get(slot.day_of_week)?.has(slot.block_start_utc);
    if (!hasPref) {
      console.error(
        `[에러] V5: 플레이어 ${r.player_id}가 ${slot.day_of_week} 블록 ${slot.block_start_utc}에 배정되었으나, 해당 지망(preferences)이 없습니다.`
      );
      errors++;
    }
  }

  console.log(`\n요약: 에러 ${errors}건 / 경고 ${warnings}건`);
  if (errors > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
