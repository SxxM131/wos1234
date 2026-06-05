import { SupabaseClient } from "@supabase/supabase-js";
import { DayOfWeek } from "./types";
import { getCurrentCycleId } from "./assignment";

const ALL_DAYS: DayOfWeek[] = ["mon", "tue", "thu"];

export const DUPLICATE_DAY_MESSAGE =
  "You have already applied for this day. Contact r4 if you need changes.";

export const SUBMIT_SUCCESS_MESSAGE =
  "Your application has been received. Assignment results will be announced after the booking window closes.";

export function normalizeEmail(
  email: string | null | undefined
): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

async function getGameIdsForEmail(
  supabase: SupabaseClient,
  email: string
): Promise<number[]> {
  const { data: players } = await supabase
    .from("players")
    .select("game_id")
    .eq("email", email);
  return (players ?? []).map((p) => p.game_id);
}

async function hasPreferencesForGameIds(
  supabase: SupabaseClient,
  gameIds: number[],
  day: DayOfWeek,
  cycleId: number
): Promise<boolean> {
  if (gameIds.length === 0) return false;

  const { data: prefs } = await supabase
    .from("preferences")
    .select("id")
    .in("player_id", gameIds)
    .eq("day_of_week", day)
    .eq("cycle_id", cycleId)
    .limit(1);
  return !!prefs?.length;
}

/**
 * Returns true if any player with this email already has preferences
 * for this day in the cycle (cross-channel duplicate check).
 */
async function hasActiveDayReservationByEmail(
  supabase: SupabaseClient,
  email: string,
  day: DayOfWeek,
  cycleId: number
): Promise<boolean> {
  const gameIds = await getGameIdsForEmail(supabase, email);
  return hasPreferencesForGameIds(supabase, gameIds, day, cycleId);
}

/**
 * Returns true if the player already has preferences for this day in the cycle.
 * When email is provided, checks email + cycle_id (+ day) first; otherwise game_id + day + cycle_id.
 */
export async function hasActiveDayReservation(
  supabase: SupabaseClient,
  gameId: number,
  day: DayOfWeek,
  cycleId: number,
  email?: string | null
): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    return hasActiveDayReservationByEmail(
      supabase,
      normalizedEmail,
      day,
      cycleId
    );
  }

  const { data: prefs } = await supabase
    .from("preferences")
    .select("id")
    .eq("player_id", gameId)
    .eq("day_of_week", day)
    .eq("cycle_id", cycleId)
    .limit(1);
  return !!prefs?.length;
}

export async function getReservedDaysForPlayer(
  supabase: SupabaseClient,
  gameId: number,
  email?: string | null
): Promise<DayOfWeek[]> {
  const cycleId = await getCurrentCycleId(supabase);
  const reserved: DayOfWeek[] = [];
  for (const day of ALL_DAYS) {
    if (await hasActiveDayReservation(supabase, gameId, day, cycleId, email)) {
      reserved.push(day);
    }
  }
  return reserved;
}

/** After admin cancel, remove preferences on this day so the player can re-apply. */
export async function clearCancelledDayReservations(
  supabase: SupabaseClient,
  gameId: number,
  day: DayOfWeek,
  cycleId: number
): Promise<void> {
  await supabase
    .from("preferences")
    .delete()
    .eq("player_id", gameId)
    .eq("day_of_week", day)
    .eq("cycle_id", cycleId);
}
