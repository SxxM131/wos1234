import { SupabaseClient } from "@supabase/supabase-js";
import { DayOfWeek } from "./types";
import { getCurrentCycleId } from "./assignment";

const ALL_DAYS: DayOfWeek[] = ["mon", "tue", "thu"];

export const SUBMIT_RECEIVED_MESSAGE = "Your application has been received.";

export const SUBMIT_UPDATED_MESSAGE = "Your application has been updated.";

export const ASSIGNMENT_LOCKED_MESSAGE =
  "Applications cannot be changed after assignment. Contact r4 if you need changes.";

/** Shown on the reservation check page while assignment is pending. */
export const SUBMIT_SUCCESS_MESSAGE =
  "Your application has been received. Assignment results will be announced after the booking window closes.";

export async function playerHasAnyPreferencesInCycle(
  supabase: SupabaseClient,
  playerId: number,
  cycleId: number
): Promise<boolean> {
  const { count, error } = await supabase
    .from("preferences")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId)
    .eq("cycle_id", cycleId);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function getReservedDaysForPlayer(
  supabase: SupabaseClient,
  playerId: number
): Promise<DayOfWeek[]> {
  const cycleId = await getCurrentCycleId(supabase);
  const { data } = await supabase
    .from("preferences")
    .select("day_of_week")
    .eq("player_id", playerId)
    .eq("cycle_id", cycleId);
  const days = new Set((data ?? []).map((p) => p.day_of_week as DayOfWeek));
  return ALL_DAYS.filter((d) => days.has(d));
}

/** After admin cancel, remove preferences on this day so the player can re-apply. */
export async function clearCancelledDayReservations(
  supabase: SupabaseClient,
  playerId: number,
  day: DayOfWeek,
  cycleId: number
): Promise<void> {
  await supabase
    .from("preferences")
    .delete()
    .eq("player_id", playerId)
    .eq("day_of_week", day)
    .eq("cycle_id", cycleId);
}
