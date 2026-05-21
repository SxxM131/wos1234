import { SupabaseClient } from "@supabase/supabase-js";
import { DayOfWeek, DAY_CONFIG } from "./types";
import { dayLabel, formatBlockRange } from "./utils";

export interface SubmitInput {
  gameId: number;
  name: string;
  alliance: string;
  dayOfWeek: DayOfWeek;
  speedup: number;
  preferredBlocks: number[];
  skipPlayerUpsert?: boolean;
}

export interface DaySubmit {
  dayOfWeek: DayOfWeek;
  speedup: number;
  preferredBlocks: number[];
}

export interface AssignmentResult {
  success: boolean;
  message: string;
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

export async function processReservation(
  supabase: SupabaseClient,
  input: SubmitInput
): Promise<AssignmentResult> {
  const open = await isReservationOpen(supabase);
  if (!open) {
    return { success: false, message: "Reservations are currently closed." };
  }

  const cycleId = await getCurrentCycleId(supabase);
  const config = DAY_CONFIG[input.dayOfWeek];
  const speedupKey = config.speedupKey;
  const now = new Date().toISOString();

  if (!input.skipPlayerUpsert) {
    const playerData: Record<string, unknown> = {
      game_id: input.gameId,
      name: input.name,
      alliance: input.alliance,
      [speedupKey]: input.speedup,
    };
    const { error: playerError } = await supabase
      .from("players")
      .upsert(playerData, { onConflict: "game_id" });
    if (playerError) {
      return { success: false, message: `Failed to save player: ${playerError.message}` };
    }
  }

  // Check existing reservation for same day + cycle → modify flow
  const { data: existingRes } = await supabase
    .from("reservations")
    .select("id, slots!inner(day_of_week)")
    .eq("player_id", input.gameId)
    .eq("cycle_id", cycleId)
    .in("status", ["assigned", "eliminated"]);

  const hasSameDay = existingRes?.some((r) => {
    const slots = r.slots as unknown as { day_of_week: string };
    return slots.day_of_week === input.dayOfWeek;
  });

  if (hasSameDay) {
    const { data: daySlots } = await supabase
      .from("slots")
      .select("id")
      .eq("day_of_week", input.dayOfWeek);
    const slotIds = daySlots?.map((s) => s.id) ?? [];

    await supabase
      .from("reservations")
      .delete()
      .eq("player_id", input.gameId)
      .eq("cycle_id", cycleId)
      .in("slot_id", slotIds);

    await supabase
      .from("preferences")
      .delete()
      .eq("player_id", input.gameId)
      .eq("day_of_week", input.dayOfWeek)
      .eq("cycle_id", cycleId);
  }

  // Save preferences
  for (const block of input.preferredBlocks) {
    await supabase.from("preferences").upsert(
      {
        player_id: input.gameId,
        day_of_week: input.dayOfWeek,
        block_start_utc: block,
        cycle_id: cycleId,
      },
      { onConflict: "player_id,day_of_week,block_start_utc,cycle_id" }
    );
  }

  const eliminatedBlocks: number[] = [];
  let assignedSlotId: number | null = null;
  let assignedBlock: number | null = null;
  let assignedSlotIndex: number | null = null;
  let movedFromPreferred = false;

  // Phase 1: preferred blocks
  for (const block of input.preferredBlocks) {
    const result = await assignToBlock(
      supabase,
      input.gameId,
      input.speedup,
      input.dayOfWeek,
      block,
      cycleId,
      now
    );
    if (result.assigned) {
      assignedSlotId = result.slotId!;
      assignedBlock = block;
      assignedSlotIndex = result.slotIndex!;
      break;
    }
    eliminatedBlocks.push(block);
  }

  // Phase 2: remaining preferred blocks for eliminated
  if (!assignedSlotId && eliminatedBlocks.length > 0) {
    const remaining = input.preferredBlocks.filter(
      (b) => !eliminatedBlocks.includes(b) || eliminatedBlocks.indexOf(b) > 0
    );
    const blocksToTry = input.preferredBlocks.filter((b) =>
      eliminatedBlocks.includes(b)
    );

    for (const block of blocksToTry) {
      const result = await tryEmptySlot(
        supabase,
        input.gameId,
        input.dayOfWeek,
        block,
        cycleId,
        now
      );
      if (result.assigned) {
        assignedSlotId = result.slotId!;
        assignedBlock = block;
        assignedSlotIndex = result.slotIndex!;
        movedFromPreferred = eliminatedBlocks.includes(block);
        break;
      }
    }

    if (!assignedSlotId) {
      for (const block of remaining) {
        if (blocksToTry.includes(block)) continue;
        const result = await tryEmptySlot(
          supabase,
          input.gameId,
          input.dayOfWeek,
          block,
          cycleId,
          now
        );
        if (result.assigned) {
          assignedSlotId = result.slotId!;
          assignedBlock = block;
          assignedSlotIndex = result.slotIndex!;
          movedFromPreferred = true;
          break;
        }
      }
    }
  }

  if (!assignedSlotId) {
    await supabase.from("reservations").insert({
      player_id: input.gameId,
      slot_id: null,
      status: "eliminated",
      cycle_id: cycleId,
      applied_at: now,
    });
    return {
      success: false,
      message:
        "All preferred time slots are full. Check your status on the /status page.",
    };
  }

  const day = dayLabel(input.dayOfWeek);
  const timeStr = formatBlockRange(assignedBlock!, "UTC");

  return {
    success: true,
    message: `${day} ${timeStr} — applied`,
  };
}

async function upsertPlayerForDays(
  supabase: SupabaseClient,
  gameId: number,
  name: string,
  alliance: string,
  days: DaySubmit[]
) {
  const { data: existing } = await supabase
    .from("players")
    .select("speedup_vp, speedup_mo")
    .eq("game_id", gameId)
    .maybeSingle();

  let speedupVp = existing?.speedup_vp ?? 0;
  let speedupMo = existing?.speedup_mo ?? 0;

  for (const d of days) {
    if (d.dayOfWeek === "mon" || d.dayOfWeek === "tue") {
      speedupVp = Math.max(speedupVp, d.speedup);
    }
    if (d.dayOfWeek === "thu") {
      speedupMo = d.speedup;
    }
  }

  const { error } = await supabase.from("players").upsert(
    {
      game_id: gameId,
      name,
      alliance,
      speedup_vp: speedupVp,
      speedup_mo: speedupMo,
    },
    { onConflict: "game_id" }
  );
  return error;
}

export async function processMultiDayReservation(
  supabase: SupabaseClient,
  gameId: number,
  name: string,
  alliance: string,
  days: DaySubmit[]
): Promise<AssignmentResult> {
  const open = await isReservationOpen(supabase);
  if (!open) {
    return { success: false, message: "Reservations are currently closed." };
  }

  if (days.length === 0) {
    return { success: false, message: "Select at least one day." };
  }

  const playerError = await upsertPlayerForDays(
    supabase,
    gameId,
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

  const messages: string[] = [];
  let anySuccess = false;

  for (const day of days) {
    const result = await processReservation(supabase, {
      gameId,
      name,
      alliance,
      dayOfWeek: day.dayOfWeek,
      speedup: day.speedup,
      preferredBlocks: day.preferredBlocks,
      skipPlayerUpsert: true,
    });
    messages.push(result.message);
    if (result.success) anySuccess = true;
  }

  return {
    success: anySuccess,
    message: messages.join("\n"),
  };
}

async function assignToBlock(
  supabase: SupabaseClient,
  playerId: number,
  speedup: number,
  day: DayOfWeek,
  blockStart: number,
  cycleId: number,
  appliedAt: string
): Promise<{ assigned: boolean; slotId?: number; slotIndex?: number }> {
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
    .select("player_id, applied_at, players(speedup_vp, speedup_mo)")
    .in("slot_id", slotIds)
    .eq("cycle_id", cycleId)
    .eq("status", "assigned");

  const config = DAY_CONFIG[day];
  const applicants: Applicant[] = (existing ?? []).map((r) => {
    const p = r.players as unknown as { speedup_vp: number; speedup_mo: number };
    return {
      playerId: r.player_id,
      speedup: p[config.speedupKey],
      appliedAt: r.applied_at,
      isNew: false,
    };
  });

  applicants.push({
    playerId,
    speedup,
    appliedAt,
    isNew: true,
  });

  applicants.sort((a, b) => {
    if (b.speedup !== a.speedup) return b.speedup - a.speedup;
    return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
  });

  const top4 = applicants.slice(0, 4);
  const rank = top4.findIndex((a) => a.playerId === playerId);

  if (rank < 0) return { assigned: false };

  // Clear block assignments and reassign top 4
  await supabase
    .from("reservations")
    .delete()
    .in("slot_id", slotIds)
    .eq("cycle_id", cycleId)
    .eq("status", "assigned");

  const demoted = applicants.slice(4);
  for (const d of demoted) {
    const { data: existing } = await supabase
      .from("reservations")
      .select("id")
      .eq("player_id", d.playerId)
      .eq("cycle_id", cycleId)
      .eq("status", "assigned")
      .maybeSingle();
    if (existing) {
      await supabase
        .from("reservations")
        .update({ status: "eliminated", slot_id: null })
        .eq("id", existing.id);
    }
  }

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
  };
}

async function tryEmptySlot(
  supabase: SupabaseClient,
  playerId: number,
  day: DayOfWeek,
  blockStart: number,
  cycleId: number,
  appliedAt: string
): Promise<{ assigned: boolean; slotId?: number; slotIndex?: number }> {
  const { data: blockSlots } = await supabase
    .from("slots")
    .select("id, slot_index")
    .eq("day_of_week", day)
    .eq("block_start_utc", blockStart)
    .eq("is_active", true)
    .order("slot_index");

  if (!blockSlots) return { assigned: false };

  for (const slot of blockSlots) {
    const { data: taken } = await supabase
      .from("reservations")
      .select("id")
      .eq("slot_id", slot.id)
      .eq("cycle_id", cycleId)
      .eq("status", "assigned")
      .maybeSingle();

    if (!taken) {
      await supabase.from("reservations").upsert(
        {
          player_id: playerId,
          slot_id: slot.id,
          status: "assigned",
          cycle_id: cycleId,
          applied_at: appliedAt,
        },
        { onConflict: "player_id,slot_id,cycle_id" }
      );
      return { assigned: true, slotId: slot.id, slotIndex: slot.slot_index };
    }
  }
  return { assigned: false };
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

  const config = DAY_CONFIG[slot.day_of_week as DayOfWeek];

  const { data: eliminated } = await supabase
    .from("reservations")
    .select("id, player_id, applied_at, players(speedup_vp, speedup_mo)")
    .eq("status", "eliminated")
    .eq("cycle_id", cycleId)
    .is("slot_id", null);

  if (!eliminated?.length) return;

  const { data: prefs } = await supabase
    .from("preferences")
    .select("player_id")
    .eq("day_of_week", slot.day_of_week)
    .eq("block_start_utc", slot.block_start_utc)
    .eq("cycle_id", cycleId);

  const prefPlayerIds = new Set(prefs?.map((p) => p.player_id) ?? []);

  const candidates = eliminated
    .filter((e) => prefPlayerIds.has(e.player_id))
    .map((e) => {
      const p = e.players as unknown as { speedup_vp: number; speedup_mo: number };
      return {
        id: e.id,
        playerId: e.player_id,
        speedup: p[config.speedupKey],
        appliedAt: e.applied_at,
      };
    })
    .sort((a, b) => {
      if (b.speedup !== a.speedup) return b.speedup - a.speedup;
      return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
    });

  if (candidates.length === 0) return;

  const winner = candidates[0];
  await supabase
    .from("reservations")
    .update({ status: "assigned", slot_id: slotId })
    .eq("id", winner.id);
}
