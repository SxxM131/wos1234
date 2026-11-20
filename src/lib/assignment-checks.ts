/**
 * Assignment integrity checks (V1–V6), shared by `verify:assignment` (DB)
 * and `local:assign` (offline Google Form pipeline).
 */

export type CheckSlot = {
  id: number;
  day_of_week: string;
  block_start_utc: number;
  is_active: boolean;
};

export type CheckInput = {
  slots: CheckSlot[];
  /** Assigned reservations (slot_id set). */
  assigned: { player_id: number; slot_id: number }[];
  preferences: { player_id: number; day_of_week: string; block_start_utc: number }[];
  /** Speedup used for V4 (rank order the assignment used). */
  speedupFor: (playerId: number, day: string) => number;
  /** DB only: players with an eliminated marker. Omit to skip V6. */
  eliminatedPlayerIds?: Set<number>;
  playerName?: (playerId: number) => string;
};

export function runAssignmentChecks(input: CheckInput): {
  errors: number;
  warnings: number;
} {
  const { slots, assigned, preferences, speedupFor: getSpeedup } = input;
  let errors = 0;
  let warnings = 0;

  const slotsById = new Map<number, CheckSlot>();
  const activeSlotsByBlock = new Map<string, Map<number, CheckSlot[]>>();

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

  const assignedByPlayerDay = new Map<number, Map<string, CheckInput["assigned"]>>();

  for (const r of assigned) {
    const slot = slotsById.get(r.slot_id);
    if (!slot) continue;

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

  /** Truth waitlist: prefs that day + not assigned that day (ignores eliminated rows). */
  function truthWaitlistForDay(day: string): number[] {
    const out: number[] = [];
    for (const [playerId, dayMap] of Array.from(prefByPlayerDayBlock.entries())) {
      if (!dayMap.has(day)) continue;
      const isAssignedOnDay = assignedByPlayerDay.get(playerId)?.has(day) ?? false;
      if (isAssignedOnDay) continue;
      out.push(playerId);
    }
    return out;
  }

  for (const day of ["mon", "tue", "thu"]) {
    console.log(`\n--- [${day.toUpperCase()}] ---`);
    const daySlotsMap = activeSlotsByBlock.get(day) ?? new Map();
    const truthWaitlist = truthWaitlistForDay(day);

    for (const block of Array.from(daySlotsMap.keys()).sort((a, b) => a - b)) {
      const activeSlotsForBlock = slots.filter(
        (s) => s.day_of_week === day && s.block_start_utc === block && s.is_active
      );
      const activeSlotIds = activeSlotsForBlock.map((s) => s.id);
      const activeSlotIdsSet = new Set(activeSlotIds);

      const assignedForThisBlock = assigned.filter((r) => activeSlotIdsSet.has(r.slot_id));
      const assignedCount = assignedForThisBlock.length;

      // Waitlist who preferred this block (truth = prefs + unassigned; not elim-row gated)
      const waitlistWanted = truthWaitlist.filter((playerId) =>
        prefByPlayerDayBlock.get(playerId)?.get(day)?.has(block)
      );

      const emptyCount = activeSlotsForBlock.length - assignedCount;

      // V1
      if (emptyCount > 0 && waitlistWanted.length > 0) {
        console.warn(
          `[경고] V1: ${day} 블록 ${block}에 빈 자리(${emptyCount}개)가 있지만 대기자(${waitlistWanted.length}명)가 존재합니다.`
        );
        warnings++;
      }

      // V4
      if (emptyCount > 0) {
        const assignedListWhoPreferred = assignedForThisBlock.filter((r) => {
          const hasPref = prefByPlayerDayBlock.get(r.player_id)?.get(day)?.has(block);
          return hasPref;
        });

        if (assignedListWhoPreferred.length > 0 && waitlistWanted.length > 0) {
          const assignedSpeedups = assignedListWhoPreferred.map((r) => getSpeedup(r.player_id, day));
          const waitSpeedups = waitlistWanted.map((id) => getSpeedup(id, day));
          const minAssigned = Math.min(...assignedSpeedups);
          const maxWait = Math.max(...waitSpeedups);
          if (maxWait > minAssigned) {
            console.warn(
              `[경고] V4: ${day} 블록 ${block}에서 스피드업 역전 발생 (배정 최소: ${minAssigned}, 대기자 최대: ${maxWait})`
            );
            warnings++;
          }
        }
      }
    }

    // V6: prefs + unassigned that day, but missing eliminated marker
    // (batch may drop markers for partial assignees; UI/promote no longer need them)
    if (input.eliminatedPlayerIds) {
      for (const playerId of truthWaitlist) {
        if (input.eliminatedPlayerIds.has(playerId)) continue;
        const name = input.playerName?.(playerId) ?? "?";
        console.warn(
          `[경고] V6: ${day} 대기 자격(prefs+미배정)인데 eliminated 마커 없음 — ${name} (${playerId}) (표시/승격은 prefs 기준이라 동작에는 영향 없음)`
        );
        warnings++;
      }
    }
  }

  console.log("\n--- [공통/전체 에러 체크] ---");

  // V2
  for (const [playerId, dayMap] of Array.from(assignedByPlayerDay.entries())) {
    for (const [day, resList] of Array.from(dayMap.entries())) {
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
  return { errors, warnings };
}
