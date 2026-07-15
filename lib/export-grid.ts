import { DayOfWeek, ALLIANCE_OPTIONS } from "./types";

export const EXPORT_DAY_ORDER: DayOfWeek[] = ["mon", "tue", "thu"];

/** Excel/CSV day labels: Monday→day1, Tuesday→day2, Thursday→day4 */
export function exportDayLabel(day: DayOfWeek): string {
  if (day === "mon") return "day1";
  if (day === "tue") return "day2";
  return "day4";
}

export const EXPORT_CSV_HEADER =
  "Day,Block (UTC),Slot # (1-4),Slot start (UTC),Player Name,Player ID,Alliance,Speedup (days),Status";

export interface SlotExportRow {
  day: string;
  blockUtc: string;
  slotStartUtc: string;
  slotNum: number;
  playerId: string;
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
    player_id: number;
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

  let playerId = "";
  let name = "";
  let alliance = "";
  let speedup = "";
  let status = "";

  if (reservation) {
    playerId = String(reservation.player_id ?? "");
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
    playerId,
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
    escape(row.slotNum),
    escape(row.slotStartUtc),
    escape(row.name),
    escape(row.playerId),
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

export interface DayAllianceSummary {
  day: DayOfWeek;
  dayLabel: string;
  stats: AllianceSummaryStat[];
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

function emptyAllianceMap(): Map<string, { playerIds: Set<number>; speedup: number }> {
  const byAlliance = new Map<string, { playerIds: Set<number>; speedup: number }>();
  for (const alliance of ALLIANCE_OPTIONS) {
    byAlliance.set(alliance, { playerIds: new Set(), speedup: 0 });
  }
  return byAlliance;
}

function finalizeAllianceStats(
  byAlliance: Map<string, { playerIds: Set<number>; speedup: number }>
): AllianceSummaryStat[] {
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

function speedupForDay(
  players: AssignedReservationForSummary["players"],
  day: DayOfWeek
): number {
  if (!players) return 0;
  if (day === "mon") return players.speedup_mon;
  if (day === "tue") return players.speedup_tue;
  return players.speedup_thu;
}

/** Per-day alliance stats (unique assigned players + sum of that day's speedups). */
export function buildAllianceSummaryByDay(
  slots: SlotRecord[],
  assignedReservations: AssignedReservationForSummary[]
): DayAllianceSummary[] {
  const slotDay = new Map(slots.map((s) => [s.id, s.day_of_week as DayOfWeek]));

  return EXPORT_DAY_ORDER.map((day) => {
    const byAlliance = emptyAllianceMap();

    for (const r of assignedReservations) {
      if (!r.players || r.slot_id == null) continue;
      if (slotDay.get(r.slot_id) !== day) continue;

      const alliance = r.players.alliance?.trim() || "Unknown";
      let entry = byAlliance.get(alliance);
      if (!entry) {
        entry = { playerIds: new Set(), speedup: 0 };
        byAlliance.set(alliance, entry);
      }
      entry.playerIds.add(r.player_id);
      entry.speedup += speedupForDay(r.players, day);
    }

    return {
      day,
      dayLabel: exportDayLabel(day),
      stats: finalizeAllianceStats(byAlliance),
    };
  });
}

/** Unique assigned players and sum of day speedups per alliance across all export days. */
export function buildAllianceSummaryStats(
  slots: SlotRecord[],
  assignedReservations: AssignedReservationForSummary[]
): AllianceSummaryStat[] {
  const slotDay = new Map(slots.map((s) => [s.id, s.day_of_week as DayOfWeek]));
  const byAlliance = emptyAllianceMap();

  for (const r of assignedReservations) {
    if (!r.players || r.slot_id == null) continue;
    const day = slotDay.get(r.slot_id);
    if (!day) continue;

    const alliance = r.players.alliance?.trim() || "Unknown";
    let entry = byAlliance.get(alliance);
    if (!entry) {
      entry = { playerIds: new Set(), speedup: 0 };
      byAlliance.set(alliance, entry);
    }
    entry.playerIds.add(r.player_id);
    entry.speedup += speedupForDay(r.players, day);
  }

  return finalizeAllianceStats(byAlliance);
}

export function formatAllianceSummaryLine(stats: AllianceSummaryStat[]): string {
  const active = stats.filter((s) => s.players > 0 || s.speedupDays > 0);
  if (active.length === 0) return "No assignments";
  return (
    "- " +
    active.map((s) => `${s.alliance} ${s.players}p / ${s.speedupDays}d`).join(" - ")
  );
}

type SummaryExcelRow = Record<string, string | number>;

const SUMMARY_BLANK: SummaryExcelRow = {
  Day: "",
  Alliance: "",
  "Players (p)": "",
  "Speedup (days) (d)": "",
};

function allianceRowsForDay(
  dayLabel: string,
  stats: AllianceSummaryStat[]
): SummaryExcelRow[] {
  return stats.map((s) => ({
    Day: dayLabel,
    Alliance: s.alliance,
    "Players (p)": s.players,
    "Speedup (days) (d)": s.speedupDays,
  }));
}

/** Summary sheet: day1 / day2 / day4 alliance blocks, then Total (all days). */
export function allianceSummaryToExcelRows(
  daySummaries: DayAllianceSummary[],
  totalStats: AllianceSummaryStat[]
): SummaryExcelRow[] {
  const rows: SummaryExcelRow[] = [];

  for (let i = 0; i < daySummaries.length; i++) {
    if (i > 0) rows.push({ ...SUMMARY_BLANK });
    rows.push(...allianceRowsForDay(daySummaries[i].dayLabel, daySummaries[i].stats));
  }

  rows.push({ ...SUMMARY_BLANK });
  rows.push(...allianceRowsForDay("Total", totalStats));

  const totalPlayers = totalStats.reduce((sum, s) => sum + s.players, 0);
  const totalSpeedup = totalStats.reduce((sum, s) => sum + s.speedupDays, 0);
  rows.push({
    Day: "Total",
    Alliance: "All",
    "Players (p)": totalPlayers,
    "Speedup (days) (d)": totalSpeedup,
  });

  return rows;
}

export function slotExportRowToExcelRecord(row: SlotExportRow): Record<string, string | number> {
  return {
    Day: row.day,
    "Block (UTC)": row.blockUtc,
    "Slot # (1-4)": row.slotNum,
    "Slot start (UTC)": row.slotStartUtc,
    "Player Name": row.name,
    "Player ID": row.playerId ? Number(row.playerId) : "",
    Alliance: row.alliance,
    "Speedup (days)": row.speedup ? Number(row.speedup) : "",
    Status: row.status,
  };
}
