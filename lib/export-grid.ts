import { DayOfWeek, DAY_CONFIG } from "./types";

export const EXPORT_DAY_ORDER: DayOfWeek[] = ["mon", "tue", "thu"];

export function exportDayLabel(day: DayOfWeek): string {
  return DAY_CONFIG[day].label;
}

export const EXPORT_CSV_HEADER =
  "Day,Block (UTC),Slot start (UTC),Slot # (1-4),Game ID,Name,Alliance,Speedup (days),Status";

export interface SlotExportRow {
  day: string;
  blockUtc: string;
  slotStartUtc: string;
  slotNum: number;
  gameId: string;
  name: string;
  alliance: string;
  speedup: string;
  status: string;
}

interface SlotRecord {
  id: number;
  day_of_week: string;
  office_type: string;
  block_start_utc: number;
  slot_index: number;
}

interface ReservationRecord {
  player_id: number;
  status: string;
  players: {
    game_id: number;
    name: string;
    alliance: string;
    speedup_vp: number;
    speedup_mo: number;
  } | null;
}

export function buildSlotExportRow(
  slot: SlotRecord,
  reservation: ReservationRecord | undefined
): SlotExportRow {
  const totalHalfHoursUtc = slot.block_start_utc * 2 + slot.slot_index;
  const utcHour = Math.floor(totalHalfHoursUtc / 2) % 24;
  const utcMin = (totalHalfHoursUtc % 2) * 30;
  const pad = (n: number) => String(n).padStart(2, "0");
  const slotStartUtcStr = `${pad(utcHour)}:${pad(utcMin)}`;
  const utcBlockStr = `${pad(slot.block_start_utc)}:00~${pad(slot.block_start_utc + 2)}:00`;
  const day = slot.day_of_week as DayOfWeek;

  let gameId = "";
  let name = "";
  let alliance = "";
  let speedup = "";
  let status = "";

  if (reservation) {
    gameId = String(reservation.player_id ?? "");
    status = reservation.status ?? "";
    const p = reservation.players;
    if (!p) {
      name = "(data error)";
      alliance = "(data error)";
      speedup = "(data error)";
    } else {
      name = p.name;
      alliance = p.alliance;
      const speedupVal =
        slot.office_type === "VP" ? p.speedup_vp : p.speedup_mo;
      speedup = String(speedupVal);
    }
  }

  return {
    day: exportDayLabel(day),
    blockUtc: utcBlockStr,
    slotStartUtc: slotStartUtcStr,
    slotNum: slot.slot_index + 1,
    gameId,
    name,
    alliance,
    speedup,
    status,
  };
}

export function slotExportRowToCsvCells(
  row: SlotExportRow,
  escape: (val: unknown) => string
): string {
  return [
    escape(row.day),
    escape(row.blockUtc),
    escape(row.slotStartUtc),
    escape(row.slotNum),
    escape(row.gameId),
    escape(row.name),
    escape(row.alliance),
    escape(row.speedup),
    escape(row.status),
  ].join(",");
}

export function slotExportRowToExcelRecord(row: SlotExportRow): Record<string, string | number> {
  return {
    Day: row.day,
    "Block (UTC)": row.blockUtc,
    "Slot start (UTC)": row.slotStartUtc,
    "Slot # (1-4)": row.slotNum,
    "Game ID": row.gameId ? Number(row.gameId) : "",
    Name: row.name,
    Alliance: row.alliance,
    "Speedup (days)": row.speedup ? Number(row.speedup) : "",
    Status: row.status,
  };
}
