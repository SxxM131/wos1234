import { SupabaseClient } from "@supabase/supabase-js";
import { DayOfWeek, DAY_CONFIG } from "./types";
import {
  SUBMIT_RECEIVED_MESSAGE,
  SUBMIT_UPDATED_MESSAGE,
  playerHasAnyPreferencesInCycle,
} from "./reservation-guard";

export interface DaySubmit {
  dayOfWeek: DayOfWeek;
  speedup: number;
  preferredBlocks: number[];
}

export interface AssignmentResult {
  success: boolean;
  message: string;
  touchedPlayerIds?: number[];
}

interface Applicant {
  playerId: number;
  speedup: number;
  appliedAt: string;
  isNew: boolean;
}

export async function getCurrentCycleId(
  supabase: SupabaseClient
): Promise<number> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "current_cycle_id")
    .single();
  return parseInt(data?.value ?? "1", 10);
}

export async function isReservationOpen(
  supabase: SupabaseClient
): Promise<boolean> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "reservation_open")
    .single();
  return data?.value !== "false";
}

export const SECRET_URL_CLOSED_MESSAGE =
  "Secret URL applications are currently closed.";

function getSpeedup(player: { speedup_mon: number; speedup_tue: number; speedup_thu: number }, day: DayOfWeek): number {
  if (day === "mon") return player.speedup_mon;
  if (day === "tue") return player.speedup_tue;
  return player.speedup_thu;
}

async function upsertPlayerForDays(
  supabase: SupabaseClient,
  playerId: number,
  name: string,
  alliance: string,
  days: DaySubmit[]
) {
  const { data: existing } = await supabase
    .from("players")
    .select("speedup_mon, speedup_tue, speedup_thu")
    .eq("player_id", playerId)
    .maybeSingle();

  let speedupMon = existing?.speedup_mon ?? 0;
  let speedupTue = existing?.speedup_tue ?? 0;
  let speedupThu = existing?.speedup_thu ?? 0;

  for (const d of days) {
    if (d.dayOfWeek === "mon") {
      speedupMon = d.speedup;
    }
    if (d.dayOfWeek === "tue") {
      speedupTue = d.speedup;
    }
    if (d.dayOfWeek === "thu") {
      speedupThu = d.speedup;
    }
  }

  const playerRow: Record<string, unknown> = {
    player_id: playerId,
    name,
    alliance,
    speedup_mon: speedupMon,
    speedup_tue: speedupTue,
    speedup_thu: speedupThu,
  };

  const { error } = await supabase
    .from("players")
    .upsert(playerRow, { onConflict: "player_id" });
  return error;
}

export interface ProcessMultiDayReservationOptions {
  /** Member-facing paths: skip reservation_open (enforced elsewhere or via Google Form). */
  skipOpenCheck?: boolean;
}

export async function processMultiDayReservation(
  supabase: SupabaseClient,
  playerId: number,
  name: string,
  alliance: string,
  days: DaySubmit[],
  options?: ProcessMultiDayReservationOptions
): Promise<AssignmentResult> {
  if (days.length === 0) {
    return { success: false, message: "Select at least one day." };
  }

  if (!options?.skipOpenCheck) {
    const open = await isReservationOpen(supabase);
    if (!open) {
      return { success: false, message: "Reservations are currently closed." };
    }
  }

  const cycleId = await getCurrentCycleId(supabase);
  const hadExisting = await playerHasAnyPreferencesInCycle(
    supabase,
    playerId,
    cycleId
  );

  const playerError = await upsertPlayerForDays(
    supabase,
    playerId,
    name,
    alliance,
    days
  );
  if (playerError) {
    return {
      success: false,
      message: `Failed to save player: ${playerError.message}`,
    };
  }

  if (options?.skipOpenCheck && (await getLastAssignmentRun(supabase))) {
    const { error: resDeleteError } = await supabase
      .from("reservations")
      .delete()
      .eq("player_id", playerId)
      .eq("cycle_id", cycleId);
    if (resDeleteError) {
      return {
        success: false,
        message: `Failed to clear prior assignments: ${resDeleteError.message}`,
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("preferences")
    .delete()
    .eq("player_id", playerId)
    .eq("cycle_id", cycleId);
  if (deleteError) {
    return {
      success: false,
      message: `Failed to replace preferences: ${deleteError.message}`,
    };
  }

  for (const day of days) {
    const preferredBlocks = Array.from(new Set(day.preferredBlocks));
    for (const block of preferredBlocks) {
      const { error: prefError } = await supabase.from("preferences").insert({
        player_id: playerId,
        day_of_week: day.dayOfWeek,
        block_start_utc: block,
        cycle_id: cycleId,
      });
      if (prefError) {
        return {
          success: false,
          message: `Failed to save preferences: ${prefError.message}`,
        };
      }
    }
  }

  return {
    success: true,
    message: hadExisting ? SUBMIT_UPDATED_MESSAGE : SUBMIT_RECEIVED_MESSAGE,
    touchedPlayerIds: [playerId],
  };
}

async function getAssignedPlayerIdsOnDay(
  supabase: SupabaseClient,
  day: DayOfWeek,
  cycleId: number
): Promise<Set<number>> {
  const { data: daySlots } = await supabase
    .from("slots")
    .select("id")
    .eq("day_of_week", day);
  const slotIds = daySlots?.map((s) => s.id) ?? [];
  if (!slotIds.length) return new Set();

  const { data: assigned } = await supabase
    .from("reservations")
    .select("player_id")
    .eq("cycle_id", cycleId)
    .eq("status", "assigned")
    .in("slot_id", slotIds);

  return new Set((assigned ?? []).map((r) => r.player_id));
}

export async function assignToBlock(
  supabase: SupabaseClient,
  playerId: number,
  speedup: number,
  day: DayOfWeek,
  blockStart: number,
  cycleId: number,
  appliedAt: string
): Promise<{ assigned: boolean; slotId?: number; slotIndex?: number; displacedPlayerIds?: number[] }> {
  const assignedOnDay = await getAssignedPlayerIdsOnDay(supabase, day, cycleId);
  if (assignedOnDay.has(playerId)) {
    const { data: dayAssigned } = await supabase
      .from("reservations")
      .select("slots(block_start_utc)")
      .eq("player_id", playerId)
      .eq("cycle_id", cycleId)
      .eq("status", "assigned");
    const inThisBlock = (dayAssigned ?? []).some(
      (r) =>
        (r.slots as unknown as { block_start_utc: number } | null)
          ?.block_start_utc === blockStart
    );
    if (!inThisBlock) return { assigned: false };
  }

  const { data: blockSlots } = await supabase
    .from("slots")
    .select("id, slot_index, is_active")
    .eq("day_of_week", day)
    .eq("block_start_utc", blockStart)
    .eq("is_active", true)
    .order("slot_index");

  if (!blockSlots?.length) return { assigned: false };

  const slotIds = blockSlots.map((s) => s.id);

  const { data: existing } = await supabase
    .from("reservations")
    .select("player_id, applied_at, players(speedup_mon, speedup_tue, speedup_thu)")
    .in("slot_id", slotIds)
    .eq("cycle_id", cycleId)
    .eq("status", "assigned");

  const applicants: Applicant[] = (existing ?? []).map((r) => {
    const p = r.players as unknown as { speedup_mon: number; speedup_tue: number; speedup_thu: number };
    return {
      playerId: r.player_id,
      speedup: getSpeedup(p, day),
      appliedAt: r.applied_at,
      isNew: false,
    };
  });

  const isAlreadyApplicant = applicants.some((a) => a.playerId === playerId);
  if (!isAlreadyApplicant) {
    applicants.push({
      playerId,
      speedup,
      appliedAt,
      isNew: true,
    });
  }

  applicants.sort((a, b) => {
    if (b.speedup !== a.speedup) return b.speedup - a.speedup;
    return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
  });

  const top4 = applicants.slice(0, 4);
  const rank = top4.findIndex((a) => a.playerId === playerId);

  if (rank < 0) return { assigned: false };

  const originalAssignedIds = new Set((existing ?? []).map((e) => e.player_id));
  const top4Ids = new Set(top4.map((t) => t.playerId));
  const displacedPlayerIds = Array.from(originalAssignedIds).filter((id) => !top4Ids.has(id));

  // Update demoted players to eliminated BEFORE deleting/reassigning slots
  const demoted = applicants.slice(4);
  for (const d of demoted) {
    if (d.isNew) continue;
    await supabase
      .from("reservations")
      .update({ status: "eliminated", slot_id: null })
      .eq("player_id", d.playerId)
      .eq("cycle_id", cycleId)
      .eq("status", "assigned")
      .in("slot_id", slotIds);
  }

  // Clear remaining assigned slots in the block
  await supabase
    .from("reservations")
    .delete()
    .in("slot_id", slotIds)
    .eq("cycle_id", cycleId)
    .eq("status", "assigned");

  let assignedSlotId: number | undefined;
  let assignedSlotIndex: number | undefined;

  for (let i = 0; i < top4.length; i++) {
    const slot = blockSlots[i];
    const applicant = top4[i];
    await supabase.from("reservations").upsert(
      {
        player_id: applicant.playerId,
        slot_id: slot.id,
        status: "assigned",
        cycle_id: cycleId,
        applied_at: applicant.appliedAt,
      },
      { onConflict: "player_id,slot_id,cycle_id" }
    );
    if (applicant.playerId === playerId) {
      assignedSlotId = slot.id;
      assignedSlotIndex = slot.slot_index;
    }
  }

  return {
    assigned: true,
    slotId: assignedSlotId!,
    slotIndex: assignedSlotIndex!,
    displacedPlayerIds,
  };
}

async function runReassignmentQueue(
  supabase: SupabaseClient,
  initialDisplacedIds: number[],
  day: DayOfWeek,
  cycleId: number,
  now: string,
  touchedPlayerIds: Set<number>
) {
  const queue = [...initialDisplacedIds];
  const processed = new Set<number>();

  while (queue.length > 0) {
    const playerId = queue.shift()!;
    if (processed.has(playerId)) continue;
    processed.add(playerId);

    const { data: player } = await supabase
      .from("players")
      .select("speedup_mon, speedup_tue, speedup_thu")
      .eq("player_id", playerId)
      .single();
    if (!player) continue;

    const speedup = getSpeedup(player as any, day);

    const { data: prefs } = await supabase
      .from("preferences")
      .select("block_start_utc")
      .eq("player_id", playerId)
      .eq("day_of_week", day)
      .eq("cycle_id", cycleId)
      .order("block_start_utc");

    const preferredBlocks = prefs?.map((p) => p.block_start_utc) ?? [];

    let assigned = false;
    let displacedFromThisBlock: number[] = [];

    for (const block of preferredBlocks) {
      const res = await assignToBlock(
        supabase,
        playerId,
        speedup,
        day,
        block,
        cycleId,
        now
      );
      if (res.assigned) {
        assigned = true;
        displacedFromThisBlock = res.displacedPlayerIds ?? [];
        break;
      }
    }

    if (assigned) {
      for (const displacedId of displacedFromThisBlock) {
        queue.push(displacedId);
        touchedPlayerIds.add(displacedId);
      }
    }
  }
}

export async function healEliminatedReservations(
  supabase: SupabaseClient,
  playerIds: number[],
  cycleId: number,
  now: string
) {
  for (const playerId of playerIds) {
    await supabase
      .from("reservations")
      .delete()
      .eq("player_id", playerId)
      .eq("cycle_id", cycleId)
      .eq("status", "eliminated");

    const { data: prefs } = await supabase
      .from("preferences")
      .select("day_of_week")
      .eq("player_id", playerId)
      .eq("cycle_id", cycleId);

    if (!prefs?.length) continue;

    const prefDays = Array.from(new Set(prefs.map((p) => p.day_of_week)));

    let needsEliminated = false;
    for (const day of prefDays) {
      const { data: slots } = await supabase
        .from("slots")
        .select("id")
        .eq("day_of_week", day);
      const slotIds = slots?.map((s) => s.id) ?? [];
      if (!slotIds.length) continue;

      const { data: assigned } = await supabase
        .from("reservations")
        .select("id")
        .eq("player_id", playerId)
        .eq("cycle_id", cycleId)
        .eq("status", "assigned")
        .in("slot_id", slotIds)
        .limit(1);

      if (!assigned?.length) {
        needsEliminated = true;
        break;
      }
    }

    if (needsEliminated) {
      await supabase.from("reservations").insert({
        player_id: playerId,
        slot_id: null,
        status: "eliminated",
        cycle_id: cycleId,
        applied_at: now,
      });
    }
  }
}

/**
 * Fill empty slots in a day from waitlisted players who preferred that block
 * (speedup desc, then earlier applied_at). Runs after heal / cancel / submit.
 */
export async function backfillEmptySlotsForDay(
  supabase: SupabaseClient,
  day: DayOfWeek,
  cycleId: number
): Promise<number> {
  const config = DAY_CONFIG[day];

  const { data: daySlots } = await supabase
    .from("slots")
    .select("id, block_start_utc, slot_index")
    .eq("day_of_week", day)
    .eq("is_active", true)
    .order("block_start_utc")
    .order("slot_index");

  if (!daySlots?.length) return 0;

  const allDaySlotIds = daySlots.map((s) => s.id);
  const { data: assignedOnDay } = await supabase
    .from("reservations")
    .select("player_id, slot_id")
    .eq("cycle_id", cycleId)
    .eq("status", "assigned")
    .in("slot_id", allDaySlotIds);

  const assignedPlayerIds = new Set(
    (assignedOnDay ?? []).map((r) => r.player_id)
  );

  const blocks = new Map<number, typeof daySlots>();
  for (const s of daySlots) {
    const list = blocks.get(s.block_start_utc) ?? [];
    list.push(s);
    blocks.set(s.block_start_utc, list);
  }

  let filled = 0;
  const promotedPlayerIds = new Set<number>();

  for (const [blockStart, slots] of Array.from(blocks.entries())) {
    const slotIds = slots.map((s) => s.id);
    const takenSlotIds = new Set(
      (assignedOnDay ?? [])
        .filter((r) => r.slot_id && slotIds.includes(r.slot_id))
        .map((r) => r.slot_id as number)
    );

    const emptySlots = slots
      .filter((s) => !takenSlotIds.has(s.id))
      .sort((a, b) => a.slot_index - b.slot_index);

    if (!emptySlots.length) continue;

    const { data: prefs } = await supabase
      .from("preferences")
      .select("player_id")
      .eq("day_of_week", day)
      .eq("block_start_utc", blockStart)
      .eq("cycle_id", cycleId);

    const prefPlayerIds = new Set(prefs?.map((p) => p.player_id) ?? []);
    if (!prefPlayerIds.size) continue;

    const { data: eliminated } = await supabase
      .from("reservations")
      .select("id, player_id, applied_at, players(speedup_mon, speedup_tue, speedup_thu)")
      .eq("status", "eliminated")
      .eq("cycle_id", cycleId)
      .is("slot_id", null);

    const byPlayer = new Map<
      number,
      { id: string; playerId: number; speedup: number; appliedAt: string }
    >();
    for (const e of eliminated ?? []) {
      if (
        !prefPlayerIds.has(e.player_id) ||
        assignedPlayerIds.has(e.player_id)
      ) {
        continue;
      }
      const p = e.players as unknown as {
        speedup_mon: number;
        speedup_tue: number;
        speedup_thu: number;
      };
      const row = {
        id: e.id as string,
        playerId: e.player_id,
        speedup: getSpeedup(p, day),
        appliedAt: e.applied_at,
      };
      const prev = byPlayer.get(e.player_id);
      if (!prev) {
        byPlayer.set(e.player_id, row);
        continue;
      }
      if (
        row.speedup > prev.speedup ||
        (row.speedup === prev.speedup &&
          new Date(row.appliedAt).getTime() <
            new Date(prev.appliedAt).getTime())
      ) {
        byPlayer.set(e.player_id, row);
      }
    }
    const candidates = Array.from(byPlayer.values()).sort((a, b) => {
      if (b.speedup !== a.speedup) return b.speedup - a.speedup;
      return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
    });

    for (let i = 0; i < emptySlots.length && i < candidates.length; i++) {
      const slot = emptySlots[i];
      const winner = candidates[i];
      const { error } = await supabase
        .from("reservations")
        .update({ status: "assigned", slot_id: slot.id })
        .eq("id", winner.id);

      if (!error) {
        assignedPlayerIds.add(winner.playerId);
        promotedPlayerIds.add(winner.playerId);
        filled++;
      }
    }
  }

  if (promotedPlayerIds.size > 0) {
    await healEliminatedReservations(
      supabase,
      Array.from(promotedPlayerIds),
      cycleId,
      new Date().toISOString()
    );
  }

  return filled;
}

export async function backfillEmptySlotsForCycle(
  supabase: SupabaseClient,
  cycleId: number
): Promise<number> {
  const days: DayOfWeek[] = ["mon", "tue", "thu"];
  let total = 0;
  for (const day of days) {
    total += await backfillEmptySlotsForDay(supabase, day, cycleId);
  }
  return total;
}

export async function promoteOnCancel(
  supabase: SupabaseClient,
  slotId: number,
  cycleId: number
): Promise<void> {
  const { data: slot } = await supabase
    .from("slots")
    .select("day_of_week, block_start_utc")
    .eq("id", slotId)
    .single();
  if (!slot) return;

  const day = slot.day_of_week as DayOfWeek;
  const config = DAY_CONFIG[day];
  const blockStart = slot.block_start_utc;
  const now = new Date().toISOString();

  const { data: daySlots } = await supabase
    .from("slots")
    .select("id, block_start_utc, slot_index")
    .eq("day_of_week", day)
    .eq("is_active", true);

  const activeSlots = (daySlots ?? []) as DaySlotRow[];
  const daySlotIds = activeSlots.map((s) => s.id);

  const { data: assignedOnDay } = await supabase
    .from("reservations")
    .select("player_id")
    .eq("cycle_id", cycleId)
    .eq("status", "assigned")
    .in("slot_id", daySlotIds);

  const assignedPlayerIds = new Set(
    (assignedOnDay ?? []).map((r) => r.player_id)
  );

  const { data: prefRows } = await supabase
    .from("preferences")
    .select(
      "player_id, block_start_utc, applied_at, players(speedup_mon, speedup_tue, speedup_thu)"
    )
    .eq("day_of_week", day)
    .eq("cycle_id", cycleId);

  const applicantMap = new Map<number, BatchApplicant>();
  for (const row of prefRows ?? []) {
    const p = row.players as unknown as {
      speedup_mon: number;
      speedup_tue: number;
      speedup_thu: number;
    };
    const appliedAt = row.applied_at ?? now;
    const existing = applicantMap.get(row.player_id);
    if (existing) {
      existing.blocks.add(row.block_start_utc);
      if (
        new Date(appliedAt).getTime() < new Date(existing.appliedAt).getTime()
      ) {
        existing.appliedAt = appliedAt;
      }
    } else {
      applicantMap.set(row.player_id, {
        playerId: row.player_id,
        speedup: getSpeedup(p, day),
        appliedAt,
        blocks: new Set([row.block_start_utc]),
      });
    }
  }

  const { data: eliminated } = await supabase
    .from("reservations")
    .select("id, player_id, applied_at, players(speedup_mon, speedup_tue, speedup_thu)")
    .eq("status", "eliminated")
    .eq("cycle_id", cycleId)
    .is("slot_id", null);

  if (!eliminated?.length) return;

  const elimByPlayer = new Map<
    number,
    { id: string; playerId: number; speedup: number; appliedAt: string }
  >();

  for (const e of eliminated ?? []) {
    if (assignedPlayerIds.has(e.player_id)) continue;
    const a = applicantMap.get(e.player_id);
    if (!a?.blocks.has(blockStart)) continue;
    elimByPlayer.set(e.player_id, {
      id: e.id as string,
      playerId: e.player_id,
      speedup: a.speedup,
      appliedAt: e.applied_at ?? a.appliedAt,
    });
  }

  if (elimByPlayer.size === 0) return;

  const sortCandidates = (
    list: { id: string; playerId: number; speedup: number; appliedAt: string }[]
  ) =>
    list.sort((a, b) => {
      if (b.speedup !== a.speedup) return b.speedup - a.speedup;
      return (
        new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime()
      );
    });

  const eligibleByBlock = computeEligibleByBlock(applicantMap, activeSlots);
  const top4ForBlock = eligibleByBlock.get(blockStart) ?? new Set();

  const phase1Pool = Array.from(elimByPlayer.values()).filter((c) =>
    top4ForBlock.has(c.playerId)
  );
  let candidates = sortCandidates(phase1Pool);

  if (candidates.length === 0) {
    candidates = sortCandidates(Array.from(elimByPlayer.values()));
  }

  if (candidates.length === 0) return;

  const winner = candidates[0];
  await supabase
    .from("reservations")
    .update({ status: "assigned", slot_id: slotId })
    .eq("id", winner.id);

  await healEliminatedReservations(
    supabase,
    [winner.playerId],
    cycleId,
    now
  );
  await backfillEmptySlotsForDay(supabase, day, cycleId);
}

export interface BatchDayResult {
  assigned: number;
  eliminated: number;
  byBlock: Record<string, number>;
}

export interface BatchApplicant {
  playerId: number;
  speedup: number;
  appliedAt: string;
  blocks: Set<number>;
}

export interface DaySlotRow {
  id: number;
  block_start_utc: number;
  slot_index: number;
}

export function compareBatchApplicants(
  a: BatchApplicant,
  b: BatchApplicant
): number {
  if (b.speedup !== a.speedup) return b.speedup - a.speedup;
  return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
}

/** Top-N speedup qualifiers per block (N = active slot count in that block, max 4). */
export function computeEligibleByBlock(
  applicants: Map<number, BatchApplicant>,
  daySlots: DaySlotRow[],
  blockOrder?: number[]
): Map<number, Set<number>> {
  const slotsByBlock = new Map<number, DaySlotRow[]>();
  for (const slot of daySlots) {
    const list = slotsByBlock.get(slot.block_start_utc) ?? [];
    list.push(slot);
    slotsByBlock.set(slot.block_start_utc, list);
  }

  const blockStarts =
    blockOrder ??
    Array.from(slotsByBlock.keys()).sort((a, b) => a - b);

  const eligible = new Map<number, Set<number>>();
  const countedPlayers = new Set<number>();

  for (const blockStart of blockStarts) {
    const slotsForBlock = slotsByBlock.get(blockStart) ?? [];
    const cap = slotsForBlock.length;
    if (!cap) continue;

    const ranked = Array.from(applicants.values())
      .filter((a) => a.blocks.has(blockStart))
      .sort(compareBatchApplicants);

    const blockEligible = new Set<number>();
    let usedCap = 0;

    for (const a of ranked) {
      blockEligible.add(a.playerId);
      if (!countedPlayers.has(a.playerId)) {
        countedPlayers.add(a.playerId);
        usedCap++;
      }
      if (usedCap >= cap) {
        break;
      }
    }

    eligible.set(blockStart, blockEligible);
  }
  return eligible;
}



export function solveDayAssignmentMCMF(
  applicants: Map<number, BatchApplicant>,
  daySlots: DaySlotRow[],
  blockOrder?: number[]
): Map<number, number> {
  const eligibleByBlock = computeEligibleByBlock(applicants, daySlots, blockOrder);

  const playerIds = Array.from(applicants.keys());
  const slotIds = daySlots.map((s) => s.id);
  const numPlayers = playerIds.length;
  const numSlots = slotIds.length;
  
  if (numPlayers === 0 || numSlots === 0) return new Map();

  const playerToIndex = new Map<number, number>();
  for (let i = 0; i < numPlayers; i++) {
    playerToIndex.set(playerIds[i], 2 + i);
  }

  const slotToIndex = new Map<number, number>();
  for (let i = 0; i < numSlots; i++) {
    slotToIndex.set(slotIds[i], 2 + numPlayers + i);
  }

  const numNodes = 2 + numPlayers + numSlots;
  interface Edge {
    to: number;
    cap: number;
    flow: number;
    cost: number;
    rev: number;
    isOriginal: boolean;
  }
  const graph: Edge[][] = Array.from({ length: numNodes }, () => []);

  function addEdge(u: number, v: number, cap: number, cost: number) {
    graph[u].push({ to: v, cap, flow: 0, cost, rev: graph[v].length, isOriginal: true });
    graph[v].push({ to: u, cap: 0, flow: 0, cost: -cost, rev: graph[u].length - 1, isOriginal: false });
  }

  const S = 0;
  const T = 1;

  for (const pid of playerIds) {
    addEdge(S, playerToIndex.get(pid)!, 1, 0);
  }

  for (const sid of slotIds) {
    addEdge(slotToIndex.get(sid)!, T, 1, 0);
  }

  const rankedApplicants = Array.from(applicants.values()).sort(compareBatchApplicants);
  const playerToRank = new Map<number, number>();
  for (let i = 0; i < rankedApplicants.length; i++) {
    playerToRank.set(rankedApplicants[i].playerId, i + 1);
  }

  const slotByBlock = new Map<number, number[]>();
  for (const slot of daySlots) {
    const list = slotByBlock.get(slot.block_start_utc) ?? [];
    list.push(slot.id);
    slotByBlock.set(slot.block_start_utc, list);
  }

  applicants.forEach((applicant, playerId) => {
    const rank = playerToRank.get(playerId)!;
    const pNode = playerToIndex.get(playerId)!;

    applicant.blocks.forEach((blockStart) => {
      const isTopN = eligibleByBlock.get(blockStart)?.has(playerId) ?? false;
      const cost = isTopN ? rank : rank + 1000000;
      
      const sids = slotByBlock.get(blockStart) ?? [];
      for (const sid of sids) {
        addEdge(pNode, slotToIndex.get(sid)!, 1, cost);
      }
    });
  });

  const dist = new Float64Array(numNodes);
  const parentNode = new Int32Array(numNodes);
  const parentEdge = new Int32Array(numNodes);
  const inQueue = new Uint8Array(numNodes);

  while (true) {
    dist.fill(Number.POSITIVE_INFINITY);
    parentNode.fill(-1);
    parentEdge.fill(-1);
    inQueue.fill(0);

    const queue: number[] = [S];
    dist[S] = 0;
    inQueue[S] = 1;

    let head = 0;
    while (head < queue.length) {
      const u = queue[head++];
      inQueue[u] = 0;

      for (let i = 0; i < graph[u].length; i++) {
        const edge = graph[u][i];
        if (edge.cap > edge.flow && dist[u] + edge.cost < dist[edge.to]) {
          dist[edge.to] = dist[u] + edge.cost;
          parentNode[edge.to] = u;
          parentEdge[edge.to] = i;

          if (!inQueue[edge.to]) {
            queue.push(edge.to);
            inQueue[edge.to] = 1;
          }
        }
      }
    }

    if (dist[T] === Number.POSITIVE_INFINITY) {
      break;
    }

    let push = Number.POSITIVE_INFINITY;
    let curr = T;
    while (curr !== S) {
      const p = parentNode[curr];
      const eIdx = parentEdge[curr];
      const edge = graph[p][eIdx];
      push = Math.min(push, edge.cap - edge.flow);
      curr = p;
    }

    curr = T;
    while (curr !== S) {
      const p = parentNode[curr];
      const eIdx = parentEdge[curr];
      const edge = graph[p][eIdx];
      const revEdge = graph[curr][edge.rev];
      
      edge.flow += push;
      revEdge.flow -= push;
      curr = p;
    }
  }

  const matchPlayer = new Map<number, number>();
  for (const pid of playerIds) {
    const u = playerToIndex.get(pid)!;
    for (const edge of graph[u]) {
      if (edge.isOriginal && edge.flow === 1 && edge.to !== S) {
        const slotNode = edge.to;
        const sIndex = slotNode - 2 - numPlayers;
        const sid = slotIds[sIndex];
        matchPlayer.set(pid, sid);
        break;
      }
    }
  }

  return matchPlayer;
}

export async function runBatchAssignment(
  supabase: SupabaseClient,
  cycleId: number,
  day: DayOfWeek
): Promise<BatchDayResult> {
  const config = DAY_CONFIG[day];
  const now = new Date().toISOString();

  const { data: daySlots } = await supabase
    .from("slots")
    .select("id, block_start_utc, slot_index")
    .eq("day_of_week", day)
    .eq("is_active", true)
    .order("block_start_utc", { ascending: true })
    .order("slot_index", { ascending: true });

  if (!daySlots?.length) {
    return { assigned: 0, eliminated: 0, byBlock: {} };
  }

  const { data: prefRows } = await supabase
    .from("preferences")
    .select(
      "player_id, block_start_utc, applied_at, players(speedup_mon, speedup_tue, speedup_thu)"
    )
    .eq("day_of_week", day)
    .eq("cycle_id", cycleId);

  const applicantMap = new Map<number, BatchApplicant>();
  for (const row of prefRows ?? []) {
    const p = row.players as unknown as {
      speedup_mon: number;
      speedup_tue: number;
      speedup_thu: number;
    };
    const appliedAt = row.applied_at ?? now;
    const existing = applicantMap.get(row.player_id);
    if (existing) {
      existing.blocks.add(row.block_start_utc);
      if (
        new Date(appliedAt).getTime() < new Date(existing.appliedAt).getTime()
      ) {
        existing.appliedAt = appliedAt;
      }
    } else {
      applicantMap.set(row.player_id, {
        playerId: row.player_id,
        speedup: getSpeedup(p, day),
        appliedAt,
        blocks: new Set([row.block_start_utc]),
      });
    }
  }

  const slotIds = daySlots.map((s) => s.id);
  const playerIds = Array.from(applicantMap.keys());

  if (slotIds.length) {
    await supabase
      .from("reservations")
      .delete()
      .in("slot_id", slotIds)
      .eq("cycle_id", cycleId);
  }

  if (playerIds.length) {
    const { data: stillAssigned } = await supabase
      .from("reservations")
      .select("player_id")
      .eq("cycle_id", cycleId)
      .eq("status", "assigned")
      .in("player_id", playerIds);
    const stillAssignedIds = new Set(
      (stillAssigned ?? []).map((r) => r.player_id)
    );
    const elimOnlyIds = playerIds.filter((id) => !stillAssignedIds.has(id));
    if (elimOnlyIds.length) {
      await supabase
        .from("reservations")
        .delete()
        .eq("cycle_id", cycleId)
        .eq("status", "eliminated")
        .is("slot_id", null)
        .in("player_id", elimOnlyIds);
    }
  }

  const matching = solveDayAssignmentMCMF(applicantMap, daySlots);
  const byBlock: Record<string, number> = {};

  for (const [playerId, slotId] of Array.from(matching.entries())) {
    const applicant = applicantMap.get(playerId);
    if (!applicant) continue;
    const slot = daySlots.find((s) => s.id === slotId);
    if (!slot) continue;

    const { error } = await supabase.from("reservations").insert({
      player_id: playerId,
      slot_id: slotId,
      status: "assigned",
      cycle_id: cycleId,
      applied_at: applicant.appliedAt,
    });
    if (!error) {
      const key = String(slot.block_start_utc);
      byBlock[key] = (byBlock[key] ?? 0) + 1;
    }
  }

  let eliminated = 0;
  for (const applicant of Array.from(applicantMap.values())) {
    if (matching.has(applicant.playerId)) continue;
    const { error } = await supabase.from("reservations").insert({
      player_id: applicant.playerId,
      slot_id: null,
      status: "eliminated",
      cycle_id: cycleId,
      applied_at: applicant.appliedAt,
    });
    if (!error) eliminated++;
  }

  return {
    assigned: matching.size,
    eliminated,
    byBlock,
  };
}

export async function getLastAssignmentRun(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "last_assignment_run")
    .maybeSingle();
  return data?.value ?? null;
}

export async function saveLastAssignmentRun(
  supabase: SupabaseClient,
  isoTime: string
): Promise<void> {
  await supabase
    .from("settings")
    .upsert({ key: "last_assignment_run", value: isoTime });
}

export async function getAssignmentApplicantCounts(
  supabase: SupabaseClient,
  cycleId: number
): Promise<{ mon: number; tue: number; thu: number }> {
  const days: DayOfWeek[] = ["mon", "tue", "thu"];
  const counts = { mon: 0, tue: 0, thu: 0 };
  for (const day of days) {
    const { data } = await supabase
      .from("preferences")
      .select("player_id")
      .eq("day_of_week", day)
      .eq("cycle_id", cycleId);
    counts[day] = new Set((data ?? []).map((r) => r.player_id)).size;
  }
  return counts;
}

export async function runBatchAssignmentForCycle(
  supabase: SupabaseClient,
  cycleId: number
): Promise<{
  mon: BatchDayResult;
  tue: BatchDayResult;
  thu: BatchDayResult;
}> {
  const mon = await runBatchAssignment(supabase, cycleId, "mon");
  const tue = await runBatchAssignment(supabase, cycleId, "tue");
  const thu = await runBatchAssignment(supabase, cycleId, "thu");
  await saveLastAssignmentRun(supabase, new Date().toISOString());
  return { mon, tue, thu };
}
