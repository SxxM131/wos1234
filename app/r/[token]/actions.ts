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
    return { success: false, message: "필수 항목을 모두 입력해 주세요." };
  }

  if (isNaN(speedup) || speedup < 0 || !Number.isInteger(speedup)) {
    return {
      success: false,
      message: "스피드업은 0 이상의 정수만 입력 가능합니다.",
    };
  }

  if (preferredBlocks.length === 0) {
    return {
      success: false,
      message: "선호 시간대를 1개 이상 선택해 주세요.",
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
    return { error: "게임 ID를 입력해 주세요." };
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
    return { error: "해당 게임 ID의 예약 정보가 없습니다." };
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
