import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { getAdminSession } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentCycleId, getLastAssignmentRun } from "@/lib/assignment";
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
      "id, status, player_id, slot_id, players(player_id, name, alliance, speedup_mon, speedup_tue, speedup_thu), slots(id, day_of_week, block_start_utc, slot_index, office_type, is_active)"
    )
    .eq("cycle_id", cycleId)
    .not("slot_id", "is", null)
    .order("applied_at");

  const { data: eliminated } = await supabase
    .from("reservations")
    .select("id, player_id, players(player_id, name, alliance, speedup_mon, speedup_tue, speedup_thu)")
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

  const { data: prefRows } = await supabase
    .from("preferences")
    .select(
      "player_id, day_of_week, block_start_utc, players(player_id, name, alliance, speedup_mon, speedup_tue, speedup_thu)"
    )
    .eq("cycle_id", cycleId);

  const applicantMap = new Map<
    number,
    {
      player_id: number;
      players: {
        player_id: number;
        name: string;
        alliance: string;
        speedup_mon: number;
        speedup_tue: number;
        speedup_thu: number;
      };
      preferences: { day_of_week: string; block_start_utc: number }[];
    }
  >();

  for (const row of prefRows ?? []) {
    const players = row.players as unknown as {
      player_id: number;
      name: string;
      alliance: string;
      speedup_mon: number;
      speedup_tue: number;
      speedup_thu: number;
    };
    const pref = {
      day_of_week: row.day_of_week as string,
      block_start_utc: row.block_start_utc,
    };
    const existing = applicantMap.get(row.player_id);
    if (existing) {
      existing.preferences.push(pref);
    } else {
      applicantMap.set(row.player_id, {
        player_id: row.player_id,
        players,
        preferences: [pref],
      });
    }
  }

  const applicants = Array.from(applicantMap.values());
  const assignmentPublished = !!(await getLastAssignmentRun(supabase));

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  return (
    <AdminDashboard
      reservations={
        (assignmentPublished
          ? reservations ?? []
          : []) as unknown as Parameters<typeof AdminDashboard>[0]["reservations"]
      }
      eliminated={
        (assignmentPublished
          ? elimWithPrefs
          : []) as unknown as Parameters<typeof AdminDashboard>[0]["eliminated"]
      }
      applicants={applicants}
      assignmentPublished={assignmentPublished}
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
