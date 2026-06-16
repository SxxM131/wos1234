import { SupabaseClient } from "@supabase/supabase-js";
import { DayOfWeek } from "./types";
import { getCurrentCycleId } from "./assignment";

const ALL_DAYS: DayOfWeek[] = ["mon", "tue", "thu"];

export const DUPLICATE_DAY_MESSAGE =
  "You have already applied for this day. Contact r4 if you need changes.";

export const SUBMIT_SUCCESS_MESSAGE =
  "Your application has been received. Assignment results will be announced after the booking window closes.";

/**
 * Returns true if the player already has preferences for this day in the cycle.
 */
export async function hasActiveDayReservation(
  supabase: SupabaseClient,
  playerId: number,
  day: DayOfWeek,
  cycleId: number
): Promise<boolean> {
  const { data: prefs } = await supabase
    .from("preferences")
    .select("id")
    .eq("player_id", playerId)
    .eq("day_of_week", day)
    .eq("cycle_id", cycleId)
    .limit(1);
  return !!prefs?.length;
}

export async function getReservedDaysForPlayer(
  supabase: SupabaseClient,
  playerId: number
): Promise<DayOfWeek[]> {
  const cycleId = await getCurrentCycleId(supabase);
  const reserved: DayOfWeek[] = [];
  for (const day of ALL_DAYS) {
    if (await hasActiveDayReservation(supabase, playerId, day, cycleId)) {
      reserved.push(day);
    }
  }
  return reserved;
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
