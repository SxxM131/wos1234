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
    .select("slot_id, player_id, status, players(game_id, name, alliance, speedup_vp, speedup_mo)")
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

  const days = ["mon", "tue", "thu"] as const;
  const dayNames: Record<string, string> = {
    mon: "월요일",
    tue: "화요일",
    thu: "목요일",
  };

  const escape = (val: any) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = "요일,구간(UTC),슬롯시작(UTC),슬롯시작(KST),슬롯번호(1~4),게임ID,이름,연맹,스피드업(days),상태";
  const sections: string[] = [];

  for (const d of days) {
    const daySlots = slots.filter((s) => s.day_of_week === d);
    
    // Sort chronologically: block_start_utc ASC, slot_index ASC
    daySlots.sort((a, b) => {
      if (a.block_start_utc !== b.block_start_utc) {
        return a.block_start_utc - b.block_start_utc;
      }
      return a.slot_index - b.slot_index;
    });

    const rows = daySlots.map((s) => {
      const totalHalfHoursUtc = s.block_start_utc * 2 + s.slot_index;
      const utcHour = Math.floor(totalHalfHoursUtc / 2) % 24;
      const utcMin = (totalHalfHoursUtc % 2) * 30;
      const pad = (n: number) => String(n).padStart(2, "0");
      const slotStartUtcStr = `${pad(utcHour)}:${pad(utcMin)}`;

      const totalHalfHoursKst = totalHalfHoursUtc + 18;
      const kstHour = Math.floor(totalHalfHoursKst / 2) % 24;
      const kstMin = (totalHalfHoursKst % 2) * 30;
      const nextDay = Math.floor(totalHalfHoursKst / 2) >= 24;
      const slotStartKstStr = `${pad(kstHour)}:${pad(kstMin)}${nextDay ? " (+1일)" : ""}`;

      const utcBlockStr = `${pad(s.block_start_utc)}:00~${pad(s.block_start_utc + 2)}:00`;
      const dayName = dayNames[s.day_of_week as keyof typeof dayNames] ?? s.day_of_week;
      const slotNum = s.slot_index + 1;

      const r = resMap.get(s.id);
      let gameId = "";
      let name = "";
      let alliance = "";
      let speedup = "";
      let status = "";

      if (r) {
        gameId = String(r.player_id ?? "");
        status = r.status ?? "";

        const p = r.players as unknown as {
          game_id: number;
          name: string;
          alliance: string;
          speedup_vp: number;
          speedup_mo: number;
        } | null;

        if (!p) {
          name = "(데이터오류)";
          alliance = "(데이터오류)";
          speedup = "(데이터오류)";
        } else {
          name = p.name;
          alliance = p.alliance;
          const speedupVal = s.office_type === "VP" ? p.speedup_vp : p.speedup_mo;
          speedup = String(speedupVal);
        }
      }

      return [
        escape(dayName),
        escape(utcBlockStr),
        escape(slotStartUtcStr),
        escape(slotStartKstStr),
        escape(slotNum),
        escape(gameId),
        escape(name),
        escape(alliance),
        escape(speedup),
        escape(status),
      ].join(",");
    });

    sections.push([header, ...rows].join("\n"));
  }

  return sections.join("\n\n");
}
