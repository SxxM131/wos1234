"use server";

import { createServiceClient } from "@/lib/supabase";
import {
  submitMultiDayReservationRpc,
  DaySubmit,
  getLastAssignmentRun,
  isReservationOpen,
  SECRET_URL_CLOSED_MESSAGE,
} from "@/lib/assignment";
import { DayOfWeek, DAY_CONFIG, ALLIANCE_OPTIONS, isValidAlliance } from "@/lib/types";

const ALL_DAYS: DayOfWeek[] = ["mon", "tue", "thu"];

export async function submitReservation(formData: FormData) {
  const playerId = parseInt(formData.get("player_id") as string, 10);
  const name = (formData.get("name") as string)?.trim();
  const alliance = (formData.get("alliance") as string)?.trim();
  const selectedDays = formData.getAll("days") as DayOfWeek[];

  if (!playerId || !name || !alliance || !isValidAlliance(alliance)) {
    return { success: false, message: "Please fill in all required fields and select an alliance." };
  }

  if (selectedDays.length === 0) {
    return { success: false, message: "Select at least one day." };
  }

  const daySubmits: DaySubmit[] = [];

  for (const day of selectedDays) {
    if (!ALL_DAYS.includes(day)) continue;

    const speedup = parseInt(formData.get(`speedup_${day}`) as string, 10);
    const preferredBlocks = Array.from(
      new Set(
        formData
          .getAll(`preferred_blocks_${day}`)
          .map((v) => parseInt(v as string, 10))
      )
    );

    if (isNaN(speedup) || speedup < 0 || !Number.isInteger(speedup)) {
      return {
        success: false,
        message: `${DAY_CONFIG[day].label}: speedup must be a whole number ≥ 0.`,
      };
    }

    if (preferredBlocks.length === 0) {
      return {
        success: false,
        message: `${DAY_CONFIG[day].label}: select at least one time slot.`,
      };
    }

    daySubmits.push({ dayOfWeek: day, speedup, preferredBlocks });
  }

  if (daySubmits.length === 0) {
    return { success: false, message: "Select at least one day." };
  }

  const supabase = createServiceClient();
  const open = await isReservationOpen(supabase);
  if (!open) {
    return { success: false, message: SECRET_URL_CLOSED_MESSAGE };
  }

  return submitMultiDayReservationRpc(
    supabase,
    playerId,
    name,
    alliance,
    daySubmits,
    { skipOpenCheck: true }
  );
}

export async function checkReservation(playerId: number) {
  if (!playerId || isNaN(playerId)) {
    return { error: "Please enter your Player ID." };
  }

  const supabase = createServiceClient();
  const { data: cycleData } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "current_cycle_id")
    .single();
  const cycleId = parseInt(cycleData?.value ?? "1", 10);

  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();

  const { data: preferences } = await supabase
    .from("preferences")
    .select("*")
    .eq("player_id", playerId)
    .eq("cycle_id", cycleId);

  if (!preferences?.length) {
    return { error: "No reservation found for this Player ID." };
  }

  const { data: reservations } = await supabase
    .from("reservations")
    .select("*, slots(day_of_week, block_start_utc, slot_index, office_type)")
    .eq("player_id", playerId)
    .eq("cycle_id", cycleId)
    .in("status", ["assigned", "eliminated"]);

  const assignmentCompleted = !!(await getLastAssignmentRun(supabase));

  return {
    player,
    reservations: reservations ?? [],
    preferences: preferences ?? [],
    assignmentCompleted,
  };
}
