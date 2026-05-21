"use server";

import { createServiceClient } from "@/lib/supabase";
import { getAdminSession } from "@/lib/session";
import { getCurrentCycleId, promoteOnCancel } from "@/lib/assignment";
import { formatSlotTime } from "@/lib/utils";
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

  await supabase
    .from("settings")
    .update({ value: String(newCycle) })
    .eq("key", "current_cycle_id");

  await supabase.from("reservations").delete().eq("cycle_id", cycleId);
  await supabase.from("preferences").delete().eq("cycle_id", cycleId);

  revalidatePath("/admin");
  revalidatePath("/status");
  return { success: true, cycleId: newCycle };
}

export async function cancelReservation(reservationId: string) {
  await requireAdmin();
  const supabase = createServiceClient();
  const cycleId = await getCurrentCycleId(supabase);

  const { data: res } = await supabase
    .from("reservations")
    .select("slot_id")
    .eq("id", reservationId)
    .single();

  await supabase
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", reservationId);

  if (res?.slot_id) {
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

  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      "status, players(game_id, name, alliance, speedup_vp, speedup_mo), slots(day_of_week, block_start_utc, slot_index, office_type)"
    )
    .eq("cycle_id", cycleId)
    .eq("status", "assigned"); // Only export final assigned reservations

  const dayOrder: Record<string, number> = { mon: 1, tue: 2, thu: 3 };

  // Sort chronologically: Monday -> Tuesday -> Thursday, then by time block, then by slot index
  const sorted = [...(reservations ?? [])].sort((a, b) => {
    const sA = a.slots as any;
    const sB = b.slots as any;
    if (!sA || !sB) return 0;
    const dayDiff = (dayOrder[sA.day_of_week] ?? 99) - (dayOrder[sB.day_of_week] ?? 99);
    if (dayDiff !== 0) return dayDiff;
    const blockDiff = sA.block_start_utc - sB.block_start_utc;
    if (blockDiff !== 0) return blockDiff;
    return sA.slot_index - sB.slot_index;
  });

  const header = "Day,Time (KST),Time (UTC),Player (Name/Alliance),Name,Alliance,Game ID,Office,Speedup";
  const rows = sorted
    .map((r) => {
      const p = r.players as unknown as {
        game_id: number;
        name: string;
        alliance: string;
        speedup_vp: number;
        speedup_mo: number;
      };
      const s = r.slots as unknown as {
        day_of_week: string;
        block_start_utc: number;
        slot_index: number;
        office_type: string;
      } | null;

      if (!s) return "";

      const dayName =
        s.day_of_week === "mon"
          ? "Monday"
          : s.day_of_week === "tue"
            ? "Tuesday"
            : "Thursday";

      const timeKst = formatSlotTime(s.block_start_utc, s.slot_index, "KST");
      const timeUtc = formatSlotTime(s.block_start_utc, s.slot_index, "UTC");
      const playerInfo = `${p.name}/${p.alliance}`;
      const speedup = s.office_type === "VP" ? p.speedup_vp : p.speedup_mo;

      // Escape CSV values
      const escape = (val: any) => {
        const str = String(val ?? "");
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escape(dayName),
        escape(timeKst),
        escape(timeUtc),
        escape(playerInfo),
        escape(p.name),
        escape(p.alliance),
        escape(p.game_id),
        escape(s.office_type),
        escape(speedup),
      ].join(",");
    })
    .filter(Boolean);

  return [header, ...rows].join("\n");
}
