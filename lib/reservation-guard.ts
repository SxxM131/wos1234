import { SupabaseClient } from "@supabase/supabase-js";
import { DayOfWeek } from "./types";
import { getCurrentCycleId } from "./assignment";

const ALL_DAYS: DayOfWeek[] = ["mon", "tue", "thu"];

export const DUPLICATE_DAY_MESSAGE =
  "You already have a reservation for this day. Contact r4 if you need changes.";

/**
 * Returns true if the player cannot submit a new reservation for this day
 * (assigned, waitlisted, or already applied — except admin-cancelled only).
 */
export async function hasActiveDayReservation(
  supabase: SupabaseClient,
  gameId: number,
  day: DayOfWeek,
  cycleId: number
): Promise<boolean> {
  const { data: daySlots } = await supabase
    .from("slots")
    .select("id")
    .eq("day_of_week", day);
  const slotIds = daySlots?.map((s) => s.id) ?? [];
  if (!slotIds.length) return false;

  const { data: assigned } = await supabase
    .from("reservations")
    .select("id")
    .eq("player_id", gameId)
    .eq("cycle_id", cycleId)
    .eq("status", "assigned")
    .in("slot_id", slotIds)
    .limit(1);
  if (assigned?.length) return true;

  const { data: prefs } = await supabase
    .from("preferences")
    .select("id")
    .eq("player_id", gameId)
    .eq("day_of_week", day)
    .eq("cycle_id", cycleId)
    .limit(1);
  if (!prefs?.length) return false;

  const { data: cancelled } = await supabase
    .from("reservations")
    .select("id")
    .eq("player_id", gameId)
    .eq("cycle_id", cycleId)
    .eq("status", "cancelled")
    .in("slot_id", slotIds)
    .limit(1);
  if (cancelled?.length) return false;

  const { data: eliminated } = await supabase
    .from("reservations")
    .select("id")
    .eq("player_id", gameId)
    .eq("cycle_id", cycleId)
    .eq("status", "eliminated")
    .limit(1);
  if (eliminated?.length) return true;

  return true;
}

export async function getReservedDaysForPlayer(
  supabase: SupabaseClient,
  gameId: number
): Promise<DayOfWeek[]> {
  const cycleId = await getCurrentCycleId(supabase);
  const reserved: DayOfWeek[] = [];
  for (const day of ALL_DAYS) {
    if (await hasActiveDayReservation(supabase, gameId, day, cycleId)) {
      reserved.push(day);
    }
  }
  return reserved;
}

/** After admin cancel, clear cancelled rows on this day so a new application can use the slot. */
export async function clearCancelledDayReservations(
  supabase: SupabaseClient,
  gameId: number,
  day: DayOfWeek,
  cycleId: number
): Promise<void> {
  const { data: daySlots } = await supabase
    .from("slots")
    .select("id")
    .eq("day_of_week", day);
  const slotIds = daySlots?.map((s) => s.id) ?? [];
  if (!slotIds.length) return;

  await supabase
    .from("reservations")
    .delete()
    .eq("player_id", gameId)
    .eq("cycle_id", cycleId)
    .eq("status", "cancelled")
    .in("slot_id", slotIds);
}
