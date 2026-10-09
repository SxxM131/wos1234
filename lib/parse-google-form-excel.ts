import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { DayOfWeek, DAY_CONFIG, TIME_BLOCKS, isValidAlliance } from "./types";

export type FormDayPref = {
  dayOfWeek: DayOfWeek;
  speedup: number;
  preferredBlocks: number[];
};

export type FormApplicant = {
  playerId: number;
  name: string;
  alliance: string;
  appliedAt: string;
  days: FormDayPref[];
  sourceRow: number;
};

export type ParseGoogleFormResult = {
  applicants: FormApplicant[];
  skipped: string[];
};

const DAY_BY_FORM: { day: DayOfWeek; speedupHints: string[]; blockHints: string[] }[] =
  [
    {
      day: "mon",
      speedupHints: ["construction", "speedup"],
      blockHints: ["construction", "preferred"],
    },
    {
      day: "tue",
      speedupHints: ["research", "speedup"],
      blockHints: ["research", "preferred"],
    },
    {
      day: "thu",
      speedupHints: ["troop", "speedup"],
      blockHints: ["troop", "preferred"],
    },
  ];

/** Apps Script `onFormSubmit.gs` column order (email collection ON). */
const FALLBACK_INDEX = {
  timestamp: 0,
  playerId: 2,
  name: 3,
  alliance: 4,
  speedupMon: 5,
  blocksMon: 6,
  speedupTue: 7,
  blocksTue: 8,
  speedupThu: 9,
  blocksThu: 10,
};

function normHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findCol(headers: string[], ...needles: string[]): number {
  const idx = headers.findIndex((h) => needles.every((n) => h.includes(n)));
  return idx;
}

function excelSerialToIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

export function parseBlocks(raw: unknown): number[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw
      .map((v) => parseInt(String(v), 10))
      .filter((n) => !Number.isNaN(n) && TIME_BLOCKS.includes(n));
  }
  return String(raw)
    .split(",")
    .map((s) => {
      const m = s.trim().match(/^(\d+)/);
      return m ? parseInt(m[1], 10) : NaN;
    })
    .filter((n) => !Number.isNaN(n) && TIME_BLOCKS.includes(n));
}

function parseSpeedup(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseInt(String(raw).split(".")[0], 10);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

function locateColumns(headerRow: unknown[]): {
  timestamp: number;
  playerId: number;
  name: number;
  alliance: number;
  speedup: Record<DayOfWeek, number>;
  blocks: Record<DayOfWeek, number>;
} {
  const headers = headerRow.map(normHeader);
  const playerId = findCol(headers, "player id");
  const name = findCol(headers, "player name");
  const alliance = findCol(headers, "alliance");
  const timestamp = headers.findIndex(
    (h) => h.includes("timestamp") || h.includes("타임스탬프")
  );

  const speedup: Record<DayOfWeek, number> = { mon: -1, tue: -1, thu: -1 };
  const blocks: Record<DayOfWeek, number> = { mon: -1, tue: -1, thu: -1 };

  for (const spec of DAY_BY_FORM) {
    speedup[spec.day] = findCol(headers, ...spec.speedupHints);
    blocks[spec.day] = findCol(headers, ...spec.blockHints);
  }

  const useFallback =
    playerId < 0 ||
    name < 0 ||
    alliance < 0 ||
    speedup.mon < 0 ||
    blocks.mon < 0;

  if (useFallback) {
    return {
      timestamp: timestamp >= 0 ? timestamp : FALLBACK_INDEX.timestamp,
      playerId: FALLBACK_INDEX.playerId,
      name: FALLBACK_INDEX.name,
      alliance: FALLBACK_INDEX.alliance,
      speedup: {
        mon: FALLBACK_INDEX.speedupMon,
        tue: FALLBACK_INDEX.speedupTue,
        thu: FALLBACK_INDEX.speedupThu,
      },
      blocks: {
        mon: FALLBACK_INDEX.blocksMon,
        tue: FALLBACK_INDEX.blocksTue,
        thu: FALLBACK_INDEX.blocksThu,
      },
    };
  }

  return {
    timestamp: timestamp >= 0 ? timestamp : FALLBACK_INDEX.timestamp,
    playerId,
    name,
    alliance,
    speedup,
    blocks,
  };
}

function cell(row: unknown[], index: number): unknown {
  if (index < 0 || index >= row.length) return "";
  return row[index];
}

/**
 * Parse a Google Form responses spreadsheet (xlsx).
 * Same player_id submitted more than once: last row wins (matches live resubmit).
 */
export function parseGoogleFormExcel(filePath: string): ParseGoogleFormResult {
  const wb = XLSX.read(readFileSync(filePath), { cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel file has no sheets.");
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];

  if (rows.length < 2) {
    return { applicants: [], skipped: ["No data rows."] };
  }

  const cols = locateColumns(rows[0] ?? []);
  const byPlayer = new Map<number, FormApplicant>();
  const skipped: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const excelRow = i + 1;
    const playerId = parseInt(String(cell(row, cols.playerId)).split(".")[0], 10);
    const name = String(cell(row, cols.name) ?? "").trim();
    const alliance = String(cell(row, cols.alliance) ?? "").trim();

    if (!playerId || Number.isNaN(playerId)) {
      skipped.push(`Row ${excelRow}: invalid Player ID.`);
      continue;
    }
    if (!name) {
      skipped.push(`Row ${excelRow} (id ${playerId}): name is required.`);
      continue;
    }
    if (!isValidAlliance(alliance)) {
      skipped.push(
        `Row ${excelRow} (id ${playerId}): invalid alliance "${alliance}".`
      );
      continue;
    }

    const days: FormDayPref[] = [];
    for (const day of Object.keys(DAY_CONFIG) as DayOfWeek[]) {
      const preferredBlocks = parseBlocks(cell(row, cols.blocks[day]));
      if (preferredBlocks.length === 0) continue;
      const speedup = parseSpeedup(cell(row, cols.speedup[day]));
      if (speedup == null) {
        skipped.push(
          `Row ${excelRow} (id ${playerId}): ${day} has time slots but invalid speedup.`
        );
        continue;
      }
      days.push({ dayOfWeek: day, speedup, preferredBlocks });
    }

    if (days.length === 0) {
      skipped.push(
        `Row ${excelRow} (id ${playerId}): no day with time slots.`
      );
      continue;
    }

    byPlayer.set(playerId, {
      playerId,
      name,
      alliance,
      appliedAt: excelSerialToIso(cell(row, cols.timestamp)),
      days,
      sourceRow: excelRow,
    });
  }

  return {
    applicants: Array.from(byPlayer.values()),
    skipped,
  };
}
