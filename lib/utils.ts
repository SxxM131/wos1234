import { DayOfWeek, DAY_CONFIG } from "./types";

export function utcToKstHour(utcHour: number): { hour: number; nextDay: boolean } {
  const kst = utcHour + 9;
  if (kst >= 24) return { hour: kst - 24, nextDay: true };
  return { hour: kst, nextDay: false };
}

export function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export function formatBlockRange(
  blockStartUtc: number,
  tz: "UTC" | "KST"
): string {
  const endUtc = blockStartUtc + 2;
  if (tz === "UTC") {
    return `${formatHour(blockStartUtc)}~${formatHour(endUtc)} UTC`;
  }
  const start = utcToKstHour(blockStartUtc);
  const end = utcToKstHour(endUtc);
  const startStr = formatHour(start.hour);
  const endStr = formatHour(end.hour);
  const dayNote =
    start.nextDay || end.nextDay ? " (익일)" : "";
  return `${startStr}~${endStr} KST${dayNote}`;
}

export function formatSlotTime(
  blockStartUtc: number,
  slotIndex: number,
  tz: "UTC" | "KST"
): string {
  const slotStartMin = blockStartUtc * 60 + slotIndex * 30;
  const slotEndMin = slotStartMin + 30;
  const startH = Math.floor(slotStartMin / 60) % 24;
  const startM = slotStartMin % 60;
  const endH = Math.floor(slotEndMin / 60) % 24;
  const endM = slotEndMin % 60;
  const fmt = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  if (tz === "UTC") {
    return `${fmt(startH, startM)}~${fmt(endH, endM)} UTC`;
  }
  const offset = 9 * 60;
  const kstStart = slotStartMin + offset;
  const kstEnd = slotEndMin + offset;
  const sh = Math.floor(kstStart / 60) % 24;
  const sm = kstStart % 60;
  const eh = Math.floor(kstEnd / 60) % 24;
  const em = kstEnd % 60;
  return `${fmt(sh, sm)}~${fmt(eh, em)} KST`;
}

export function dayLabel(day: DayOfWeek): string {
  return DAY_CONFIG[day].label;
}