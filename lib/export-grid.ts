import { DayOfWeek, DAY_CONFIG, ALLIANCE_OPTIONS } from "./types";

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
    speedup_mon: number;
    speedup_tue: number;
    speedup_thu: number;
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
        day === "mon" ? p.speedup_mon : day === "tue" ? p.speedup_tue : p.speedup_thu;
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

export const EXPORT_SUMMARY_SHEET_NAME = "Summary";

export interface AllianceSummaryStat {
  alliance: string;
  players: number;
  speedupDays: number;
}

interface AssignedReservationForSummary {
  player_id: number;
  slot_id: number | null;
  players: {
    alliance: string;
    speedup_mon: number;
    speedup_tue: number;
    speedup_thu: number;
  } | null;
}

/** Unique assigned players (p) and sum of day speedups (d) per alliance across Mon+Tue+Thu. */
export function buildAllianceSummaryStats(
  slots: SlotRecord[],
  assignedReservations: AssignedReservationForSummary[]
): AllianceSummaryStat[] {
  const slotDay = new Map(slots.map((s) => [s.id, s.day_of_week as DayOfWeek]));
  const byAlliance = new Map<string, { playerIds: Set<number>; speedup: number }>();

  for (const alliance of ALLIANCE_OPTIONS) {
    byAlliance.set(alliance, { playerIds: new Set(), speedup: 0 });
  }

  for (const r of assignedReservations) {
    if (!r.players || r.slot_id == null) continue;
    const day = slotDay.get(r.slot_id);
    if (!day) continue;

    const alliance = r.players.alliance?.trim() || "Unknown";
    const speedup =
      day === "mon"
        ? r.players.speedup_mon
        : day === "tue"
          ? r.players.speedup_tue
          : r.players.speedup_thu;

    let entry = byAlliance.get(alliance);
    if (!entry) {
      entry = { playerIds: new Set(), speedup: 0 };
      byAlliance.set(alliance, entry);
    }
    entry.playerIds.add(r.player_id);
    entry.speedup += speedup;
  }

  const known = ALLIANCE_OPTIONS.map((code) => {
    const entry = byAlliance.get(code)!;
    return {
      alliance: code,
      players: entry.playerIds.size,
      speedupDays: entry.speedup,
    };
  });

  const extras = Array.from(byAlliance.entries())
    .filter(([code]) => !(ALLIANCE_OPTIONS as readonly string[]).includes(code))
    .map(([alliance, { playerIds, speedup }]) => ({
      alliance,
      players: playerIds.size,
      speedupDays: speedup,
    }))
    .filter((s) => s.players > 0 || s.speedupDays > 0)
    .sort((a, b) => a.alliance.localeCompare(b.alliance));

  return [...known, ...extras];
}

export function formatAllianceSummaryLine(stats: AllianceSummaryStat[]): string {
  const active = stats.filter((s) => s.players > 0 || s.speedupDays > 0);
  if (active.length === 0) return "No assignments";
  return (
    "- " +
    active.map((s) => `${s.alliance} ${s.players}p / ${s.speedupDays}d`).join(" - ")
  );
}

export function allianceSummaryToExcelRows(
  stats: AllianceSummaryStat[]
): Record<string, string | number>[] {
  return [
    ...stats.map((s) => ({
      Alliance: s.alliance,
      "Players (p)": s.players,
      "Speedup (days) (d)": s.speedupDays,
    })),
    { Alliance: "", "Players (p)": "", "Speedup (days) (d)": "" },
    {
      Alliance: formatAllianceSummaryLine(stats),
      "Players (p)": "",
      "Speedup (days) (d)": "",
    },
  ];
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
