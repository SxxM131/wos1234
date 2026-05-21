import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentCycleId } from "@/lib/assignment";
import { AdminDashboard } from "./AdminDashboard";
import { DayOfWeek } from "@/lib/types";

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session.isLoggedIn) {
    redirect("/admin/login");
  }

  const supabase = createServiceClient();
  const cycleId = await getCurrentCycleId(supabase);

  const { data: tokenData } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "access_token")
    .single();

  const { data: openData } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "reservation_open")
    .single();

  const { data: slots } = await supabase
    .from("slots")
    .select("id, day_of_week, block_start_utc, slot_index, office_type, is_active")
    .order("block_start_utc")
    .order("slot_index");

  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      "id, status, player_id, slot_id, players(game_id, name, alliance, speedup_vp, speedup_mo), slots(id, day_of_week, block_start_utc, slot_index, office_type, is_active)"
    )
    .eq("cycle_id", cycleId)
    .not("slot_id", "is", null)
    .order("applied_at");

  const { data: eliminated } = await supabase
    .from("reservations")
    .select("id, player_id, players(game_id, name, alliance, speedup_vp, speedup_mo)")
    .eq("cycle_id", cycleId)
    .eq("status", "eliminated");

  const elimWithPrefs = await Promise.all(
    (eliminated ?? []).map(async (e) => {
      const { data: prefs } = await supabase
        .from("preferences")
        .select("day_of_week, block_start_utc")
        .eq("player_id", e.player_id)
        .eq("cycle_id", cycleId);
      return { ...e, preferences: prefs ?? [] };
    })
  );

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  return (
    <AdminDashboard
      reservations={(reservations ?? []) as unknown as Parameters<typeof AdminDashboard>[0]["reservations"]}
      eliminated={elimWithPrefs as unknown as Parameters<typeof AdminDashboard>[0]["eliminated"]}
      slots={(slots ?? []).map((s) => ({
        ...s,
        day_of_week: s.day_of_week as DayOfWeek,
      }))}
      accessToken={tokenData?.value ?? ""}
      reservationOpen={openData?.value !== "false"}
      cycleId={cycleId}
      baseUrl={baseUrl}
    />
  );
}
