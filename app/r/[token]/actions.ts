"use server";

import { createServiceClient } from "@/lib/supabase";
import { processReservation } from "@/lib/assignment";
import { DayOfWeek } from "@/lib/types";

export async function submitReservation(formData: FormData) {
  const gameId = parseInt(formData.get("game_id") as string, 10);
  const name = (formData.get("name") as string)?.trim();
  const alliance = (formData.get("alliance") as string)?.trim();
  const dayOfWeek = formData.get("day_of_week") as DayOfWeek;
  const speedup = parseInt(formData.get("speedup") as string, 10);
  const preferredBlocks = formData
    .getAll("preferred_blocks")
    .map((v) => parseInt(v as string, 10));

  if (!gameId || !name || !alliance || !dayOfWeek) {
    return { success: false, message: "Please fill in all required fields." };
  }

  if (isNaN(speedup) || speedup < 0 || !Number.isInteger(speedup)) {
    return {
      success: false,
      message: "Speedup must be a whole number ≥ 0.",
    };
  }

  if (preferredBlocks.length === 0) {
    return {
      success: false,
      message: "Select at least one preferred time slot.",
    };
  }

  const supabase = createServiceClient();
  return processReservation(supabase, {
    gameId,
    name,
    alliance,
    dayOfWeek,
    speedup,
    preferredBlocks,
  });
}

export async function checkReservation(gameId: number) {
  if (!gameId || isNaN(gameId)) {
    return { error: "Please enter your Game ID." };
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
    .eq("game_id", gameId)
    .maybeSingle();

  if (!player) {
    return { error: "No reservation found for this Game ID." };
  }

  const { data: reservations } = await supabase
    .from("reservations")
    .select("*, slots(day_of_week, block_start_utc, slot_index, office_type)")
    .eq("player_id", gameId)
    .eq("cycle_id", cycleId)
    .in("status", ["assigned", "eliminated"]);

  const { data: preferences } = await supabase
    .from("preferences")
    .select("*")
    .eq("player_id", gameId)
    .eq("cycle_id", cycleId);

  return { player, reservations: reservations ?? [], preferences: preferences ?? [] };
}
