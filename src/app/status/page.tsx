import { createServiceClient, fetchAllPages } from "@/lib/supabase";
import { getCurrentCycleId, getLastAssignmentRun } from "@/lib/assignment";
import { StatusView } from "./StatusView";
import { DayOfWeek } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const supabase = createServiceClient();
  const cycleId = await getCurrentCycleId(supabase);

  const { data: openData } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "reservation_open")
    .single();

  const { data: slots } = await supabase
    .from("slots")
    .select("id, day_of_week, block_start_utc, slot_index, is_active")
    .order("block_start_utc")
    .order("slot_index");

  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      "slot_id, player_id, status, players(name, alliance, speedup_mon, speedup_tue, speedup_thu), slots(day_of_week)"
    )
    .eq("cycle_id", cycleId)
    .eq("status", "assigned");

  const { data: preferences, error: prefError } = await fetchAllPages(
    async (from, to) =>
      await supabase
        .from("preferences")
        .select(
          "player_id, day_of_week, block_start_utc, players(name, alliance, speedup_mon, speedup_tue, speedup_thu)"
        )
        .eq("cycle_id", cycleId)
        .order("player_id")
        .order("day_of_week")
        .order("block_start_utc")
        .range(from, to)
  );
  if (prefError) {
    throw new Error(`Failed to load preferences: ${prefError.message}`);
  }

  const lastAssignmentRun = await getLastAssignmentRun(supabase);

  return (
    <StatusView
      initialSlots={(slots ?? []).map((s) => ({
        ...s,
        day_of_week: s.day_of_week as DayOfWeek,
      }))}
      initialReservations={
        (reservations ?? []) as unknown as Parameters<
          typeof StatusView
        >[0]["initialReservations"]
      }
      initialPreferences={
        (preferences ?? []) as unknown as Parameters<
          typeof StatusView
        >[0]["initialPreferences"]
      }
      reservationOpen={openData?.value !== "false"}
      cycleId={cycleId}
      assignmentPending={!lastAssignmentRun}
    />
  );
}
