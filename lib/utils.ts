import { DayOfWeek, DAY_CONFIG } from "./types";

export function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export function formatBlockRange(blockStartUtc: number): string {
  const endUtc = blockStartUtc + 2;
  return `${formatHour(blockStartUtc)}~${formatHour(endUtc)} UTC`;
}

export function formatSlotTime(
  blockStartUtc: number,
  slotIndex: number
): string {
  const slotStartMin = blockStartUtc * 60 + slotIndex * 30;
  const slotEndMin = slotStartMin + 30;
  const startH = Math.floor(slotStartMin / 60) % 24;
  const startM = slotStartMin % 60;
  const endH = Math.floor(slotEndMin / 60) % 24;
  const endM = slotEndMin % 60;
  const fmt = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return `${fmt(startH, startM)}~${fmt(endH, endM)} UTC`;
}

export function dayLabel(day: DayOfWeek): string {
  return DAY_CONFIG[day].label;
}
