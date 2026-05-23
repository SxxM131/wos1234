import { createServiceClient } from "@/lib/supabase";
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

  const { data: eliminated } = await supabase
    .from("reservations")
    .select("player_id, players(name, alliance, speedup_mon, speedup_tue, speedup_thu)")
    .eq("cycle_id", cycleId)
    .eq("status", "eliminated");

  const assignedPlayerIds = new Set(
    (reservations ?? []).map((r) => r.player_id)
  );

  const elimWithPrefs = (
    await Promise.all(
      (eliminated ?? [])
        .filter((e) => !assignedPlayerIds.has(e.player_id))
        .map(async (e) => {
          const { data: prefs } = await supabase
            .from("preferences")
            .select("block_start_utc, day_of_week")
            .eq("player_id", e.player_id)
            .eq("cycle_id", cycleId);
          return { ...e, preferences: prefs ?? [] };
        })
    )
  ).filter((e) => e.preferences.length > 0);

  const lastAssignmentRun = await getLastAssignmentRun(supabase);

  return (
    <StatusView
      initialSlots={(slots ?? []).map((s) => ({
        ...s,
        day_of_week: s.day_of_week as DayOfWeek,
      }))}
      initialReservations={(reservations ?? []) as unknown as Parameters<typeof StatusView>[0]["initialReservations"]}
      initialEliminated={elimWithPrefs as unknown as Parameters<typeof StatusView>[0]["initialEliminated"]}
      reservationOpen={openData?.value !== "false"}
      cycleId={cycleId}
      assignmentPending={!lastAssignmentRun}
    />
  );
}
