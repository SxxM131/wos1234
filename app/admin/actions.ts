"use server";

import { createServiceClient } from "@/lib/supabase";
import { getAdminSession } from "@/lib/session";
import {
  getCurrentCycleId,
  promoteOnCancel,
  runBatchAssignmentForCycle,
  getAssignmentApplicantCounts,
  getLastAssignmentRun,
} from "@/lib/assignment";
import { clearCancelledDayReservations } from "@/lib/reservation-guard";
import { getActorIp } from "@/lib/audit-log";
import { DayOfWeek } from "@/lib/types";
import {
  EXPORT_CSV_HEADER,
  EXPORT_DAY_ORDER,
  EXPORT_SUMMARY_SHEET_NAME,
  buildSlotExportRow,
  buildAllianceSummaryByDay,
  buildAllianceSummaryStats,
  allianceSummaryToExcelRows,
  exportDayLabel,
  slotExportRowToCsvCells,
  slotExportRowToExcelRecord,
} from "@/lib/export-grid";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session.isLoggedIn) {
    throw new Error("Unauthorized");
  }
}

export async function loginAdmin(formData: FormData) {
  const password = formData.get("password") as string;
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "admin_password_hash")
    .single();

  if (!data?.value) {
    return { error: "Admin password not set. Go to /admin/setup first." };
  }

  const valid = await bcrypt.compare(password, data.value);
  if (!valid) return { error: "Incorrect password." };

  const session = await getAdminSession();
  session.isLoggedIn = true;
  await session.save();
  redirect("/admin");
}

export async function setupAdminPassword(
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!password || password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "admin_password_hash")
    .single();

  if (existing?.value) {
    return { error: "Password is already configured." };
  }

  const hash = await bcrypt.hash(password, 10);
  await supabase
    .from("settings")
    .update({ value: hash })
    .eq("key", "admin_password_hash");

  const session = await getAdminSession();
  session.isLoggedIn = true;
  await session.save();
  return { ok: true };
}

export async function logoutAdmin() {
  const session = await getAdminSession();
  session.destroy();
  redirect("/admin/login");
}

export async function regenerateToken() {
  await requireAdmin();
  const token = nanoid(16);
  const supabase = createServiceClient();
  await supabase
    .from("settings")
    .update({ value: token })
    .eq("key", "access_token");
  revalidatePath("/admin");
  return { token };
}

export async function toggleReservationOpen() {
  await requireAdmin();
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "reservation_open")
    .single();
  const newVal = data?.value === "false" ? "true" : "false";
  await supabase
    .from("settings")
    .update({ value: newVal })
    .eq("key", "reservation_open");
  revalidatePath("/admin");
  revalidatePath("/status");
  return { open: newVal === "true" };
}

export async function resetCycle(confirmText: string) {
  await requireAdmin();
  if (confirmText !== "RESET") {
    return { error: "Confirmation text is incorrect." };
  }

  const supabase = createServiceClient();
  const cycleId = await getCurrentCycleId(supabase);
  const newCycle = cycleId + 1;

  const { error: rpcErr } = await supabase.rpc("archive_and_reset_cycle");
  if (rpcErr) {
    return { error: `Failed to archive and reset cycle: ${rpcErr.message}` };
  }

  await supabase.from("settings").delete().eq("key", "last_assignment_run");

  const { error: cycleErr } = await supabase
    .from("settings")
    .update({ value: String(newCycle) })
    .eq("key", "current_cycle_id");
  if (cycleErr) {
    return { error: `Failed to update cycle: ${cycleErr.message}` };
  }

  revalidatePath("/admin");
  revalidatePath("/status");
  return {
    success: true,
    cycleId: newCycle,
    message: `Cycle reset to #${newCycle}. All players, applications, and assignments were archived and removed.`,
  };
}

export async function getAssignmentPreviewForAdmin() {
  await requireAdmin();
  const supabase = createServiceClient();
  const cycleId = await getCurrentCycleId(supabase);
  const applicants = await getAssignmentApplicantCounts(supabase, cycleId);
  const lastRun = await getLastAssignmentRun(supabase);
  return { applicants, lastRun, cycleId };
}

export async function runFullBatchAssignment() {
  await requireAdmin();
  const supabase = createServiceClient();
  const cycleId = await getCurrentCycleId(supabase);
  const results = await runBatchAssignmentForCycle(supabase, cycleId);
  revalidatePath("/admin");
  revalidatePath("/status");
  return {
    success: true as const,
    mon: results.mon,
    tue: results.tue,
    thu: results.thu,
  };
}

export async function cancelReservation(reservationId: string) {
  await requireAdmin();
  const supabase = createServiceClient();
  const cycleId = await getCurrentCycleId(supabase);

  const { data: res } = await supabase
    .from("reservations")
    .select("*, slots(day_of_week)")
    .eq("id", reservationId)
    .single();

  try {
    const day = (
      res?.slots as unknown as { day_of_week: DayOfWeek } | null
    )?.day_of_week;
    const { error: auditError } = await supabase.from("audit_log").insert({
      action: "cancel_reservation",
      player_id: res?.player_id ?? null,
      day_of_week: day ?? null,
      cycle_id: cycleId,
      snapshot: res ?? null,
      actor_ip: await getActorIp(),
    });
    if (auditError) {
      console.error("audit_log insert failed (cancel_reservation):", auditError);
    }
  } catch (err) {
    console.error("audit_log insert failed (cancel_reservation):", err);
  }

  await supabase
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", reservationId);

  if (res?.slot_id && res.player_id) {
    const day = (
      res.slots as unknown as { day_of_week: DayOfWeek } | null
    )?.day_of_week;
    if (day) {
      await clearCancelledDayReservations(
        supabase,
        res.player_id,
        day,
        cycleId
      );
    }
    await promoteOnCancel(supabase, res.slot_id, cycleId);
  }

  revalidatePath("/admin");
  revalidatePath("/status");
}

export async function moveReservation(
  reservationId: string,
  newSlotId: number
) {
  await requireAdmin();
  const supabase = createServiceClient();

  const { data: targetOccupant } = await supabase
    .from("reservations")
    .select("id")
    .eq("slot_id", newSlotId)
    .eq("status", "assigned")
    .maybeSingle();

  if (targetOccupant) {
    await supabase
      .from("reservations")
      .update({ status: "eliminated", slot_id: null })
      .eq("id", targetOccupant.id);
  }

  await supabase
    .from("reservations")
    .update({ slot_id: newSlotId })
    .eq("id", reservationId);

  revalidatePath("/admin");
  revalidatePath("/status");
}

export async function exportCsv(): Promise<string> {
  await requireAdmin();
  const supabase = createServiceClient();
  const cycleId = await getCurrentCycleId(supabase);

  // Fetch all slots from the slots table
  const { data: slots, error: slotsError } = await supabase
    .from("slots")
    .select("id, day_of_week, office_type, block_start_utc, slot_index, is_active");
  if (slotsError || !slots) {
    throw new Error("Failed to fetch slots");
  }

  // Fetch all assigned reservations for this cycle
  const { data: reservations, error: resError } = await supabase
    .from("reservations")
    .select("slot_id, player_id, status, players(player_id, name, alliance, speedup_mon, speedup_tue, speedup_thu)")
    .eq("cycle_id", cycleId)
    .eq("status", "assigned");
  if (resError) {
    throw new Error("Failed to fetch reservations");
  }

  // Map reservations to their slot IDs
  const resMap = new Map<number, typeof reservations[number]>();
  if (reservations) {
    for (const r of reservations) {
      if (r.slot_id !== null) {
        resMap.set(r.slot_id, r);
      }
    }
  }

  const escape = (val: unknown) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const sections: string[] = [];

  for (const d of EXPORT_DAY_ORDER) {
    const daySlots = slots.filter((s) => s.day_of_week === d);
    daySlots.sort((a, b) => {
      if (a.block_start_utc !== b.block_start_utc) {
        return a.block_start_utc - b.block_start_utc;
      }
      return a.slot_index - b.slot_index;
    });

    const rows = daySlots.map((s) => {
      const r = resMap.get(s.id);
      const row = buildSlotExportRow(
        s,
        r
          ? {
              player_id: r.player_id,
              status: r.status,
              players: r.players as unknown as {
                player_id: number;
                name: string;
                alliance: string;
                speedup_mon: number;
                speedup_tue: number;
                speedup_thu: number;
              } | null,
            }
          : undefined
      );
      return slotExportRowToCsvCells(row, escape);
    });

    sections.push([EXPORT_CSV_HEADER, ...rows].join("\n"));
  }

  return sections.join("\n\n");
}

export async function deletePreferenceByDay(
  playerId: number,
  dayOfWeek: string,
  cycleId: number
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { data: rows } = await supabase
    .from("preferences")
    .select("*")
    .eq("player_id", playerId)
    .eq("day_of_week", dayOfWeek)
    .eq("cycle_id", cycleId);

  try {
    const { error: auditError } = await supabase.from("audit_log").insert({
      action: "delete_preference",
      player_id: playerId,
      day_of_week: dayOfWeek,
      cycle_id: cycleId,
      snapshot: rows ?? [],
      actor_ip: await getActorIp(),
    });
    if (auditError) {
      console.error("audit_log insert failed (delete_preference):", auditError);
    }
  } catch (err) {
    console.error("audit_log insert failed (delete_preference):", err);
  }

  const { error } = await supabase
    .from("preferences")
    .delete()
    .eq("player_id", playerId)
    .eq("day_of_week", dayOfWeek)
    .eq("cycle_id", cycleId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function exportExcelData(): Promise<Record<string, any[]>> {
  await requireAdmin();
  const supabase = createServiceClient();
  const cycleId = await getCurrentCycleId(supabase);

  // Fetch all slots from the slots table
  const { data: slots, error: slotsError } = await supabase
    .from("slots")
    .select("id, day_of_week, office_type, block_start_utc, slot_index, is_active");
  if (slotsError || !slots) {
    throw new Error("Failed to fetch slots");
  }

  // Fetch all assigned reservations for this cycle
  const { data: reservations, error: resError } = await supabase
    .from("reservations")
    .select("slot_id, player_id, status, players(player_id, name, alliance, speedup_mon, speedup_tue, speedup_thu)")
    .eq("cycle_id", cycleId)
    .eq("status", "assigned");
  if (resError) {
    throw new Error("Failed to fetch reservations");
  }

  // Map reservations to their slot IDs
  const resMap = new Map<number, typeof reservations[number]>();
  if (reservations) {
    for (const r of reservations) {
      if (r.slot_id !== null) {
        resMap.set(r.slot_id, r);
      }
    }
  }

  const result: Record<string, Record<string, string | number>[]> = {};

  for (const d of EXPORT_DAY_ORDER) {
    const sheetName = exportDayLabel(d);
    result[sheetName] = [];

    const daySlots = slots.filter((s) => s.day_of_week === d);
    daySlots.sort((a, b) => {
      if (a.block_start_utc !== b.block_start_utc) {
        return a.block_start_utc - b.block_start_utc;
      }
      return a.slot_index - b.slot_index;
    });

    result[sheetName] = daySlots.map((s) => {
      const r = resMap.get(s.id);
      const row = buildSlotExportRow(
        s,
        r
          ? {
              player_id: r.player_id,
              status: r.status,
              players: r.players as unknown as {
                player_id: number;
                name: string;
                alliance: string;
                speedup_mon: number;
                speedup_tue: number;
                speedup_thu: number;
              } | null,
            }
          : undefined
      );
      return slotExportRowToExcelRecord(row);
    });
  }

  const playerShape = {
    player_id: 0,
    name: "",
    alliance: "",
    speedup_mon: 0,
    speedup_tue: 0,
    speedup_thu: 0,
  };

  type PlayerRow = typeof playerShape;

  const assignedForSummary = (reservations ?? []).map((r) => ({
    player_id: r.player_id,
    slot_id: r.slot_id,
    players: r.players as unknown as PlayerRow | null,
  }));
  const daySummaries = buildAllianceSummaryByDay(slots, assignedForSummary);
  const totalStats = buildAllianceSummaryStats(slots, assignedForSummary);
  result[EXPORT_SUMMARY_SHEET_NAME] = allianceSummaryToExcelRows(
    daySummaries,
    totalStats
  );

  return result;
}
