import * as XLSX from "xlsx-js-style";
import {
  EXPORT_SUMMARY_SHEET_NAME,
  EXCEL_WAITLIST_ORIGIN_COL,
  type ExcelDaySheetData,
  type ExcelExportData,
} from "./export-grid";

/** Light green (연두색) fill for header row and slot grid columns */
const HEADER_FILL = { fgColor: { rgb: "C6EFCE" } };
const HEADER_FONT = { bold: true };
const THOUSANDS_FORMAT = "#,##0";
/** Name + speedup of applicants who left that day's speedup blank */
const MISSING_SPEEDUP_FONT_COLOR = { rgb: "FF0000" };
const MISSING_SPEEDUP_HEADERS = {
  id: "Player ID",
  red: ["Player Name", "Speedup (days)"],
};
// v2 Monday footer (Tuesday-only applicants)
const FOOTER_MISSING_SPEEDUP_HEADERS = {
  id: "player_id",
  red: ["name", "speedup_tue", "combined"],
};

const SLOT_GRID_COLUMN_HEADERS = ["Day", "Slot start (UTC)"];
const NUMERIC_COMMA_HEADERS = [
  "Speedup (days)",
  // v2 Monday footer table
  "speedup_mon",
  "speedup_tue",
];

function applyHeaderRowStyle(
  ws: XLSX.WorkSheet,
  headerRow: number,
  startCol: number,
  endCol: number
) {
  for (let c = startCol; c <= endCol; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: HEADER_FILL,
      font: HEADER_FONT,
      alignment: { vertical: "center", wrapText: true },
    };
  }
}

function findColumnIndicesInRange(
  ws: XLSX.WorkSheet,
  headerRow: number,
  startCol: number,
  endCol: number,
  headers: string[]
): number[] {
  const indices: number[] = [];
  for (let c = startCol; c <= endCol; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    const header = ws[addr]?.v;
    if (typeof header === "string" && headers.includes(header)) {
      indices.push(c);
    }
  }
  return indices;
}

/** Day / Slot start data rows share the same green fill as the header (schedule block only). */
function applySlotGridColumnStyle(
  ws: XLSX.WorkSheet,
  headerRow: number,
  startCol: number,
  endCol: number,
  lastDataRow: number
) {
  const columnIndices = findColumnIndicesInRange(
    ws,
    headerRow,
    startCol,
    endCol,
    SLOT_GRID_COLUMN_HEADERS
  );
  if (columnIndices.length === 0) return;

  for (let r = headerRow + 1; r <= lastDataRow; r++) {
    for (const c of columnIndices) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      ws[addr].s = {
        ...(ws[addr].s ?? {}),
        fill: HEADER_FILL,
      };
    }
  }
}

/** Apply Excel thousands format to numeric columns (keeps values as numbers). */
function applyThousandsNumberFormat(
  ws: XLSX.WorkSheet,
  headerRow: number,
  startCol: number,
  endCol: number,
  lastDataRow: number,
  headers: string[]
) {
  const columnIndices = findColumnIndicesInRange(
    ws,
    headerRow,
    startCol,
    endCol,
    headers
  );
  if (columnIndices.length === 0) return;

  for (let r = headerRow + 1; r <= lastDataRow; r++) {
    for (const c of columnIndices) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell || typeof cell.v !== "number") continue;
      cell.z = THOUSANDS_FORMAT;
    }
  }
}

/** Red font on `headers.red` cells of rows whose `headers.id` is in `playerIds`. */
function applyMissingSpeedupStyle(
  ws: XLSX.WorkSheet,
  headerRow: number,
  startCol: number,
  endCol: number,
  lastDataRow: number,
  headers: { id: string; red: string[] },
  playerIds: number[] | undefined
) {
  if (!playerIds?.length) return;
  const ids = new Set(playerIds);
  const [idCol] = findColumnIndicesInRange(ws, headerRow, startCol, endCol, [
    headers.id,
  ]);
  if (idCol == null) return;
  const redCols = findColumnIndicesInRange(
    ws,
    headerRow,
    startCol,
    endCol,
    headers.red
  );

  for (let r = headerRow + 1; r <= lastDataRow; r++) {
    const id = ws[XLSX.utils.encode_cell({ r, c: idCol })]?.v;
    if (!ids.has(Number(id))) continue;
    for (const c of redCols) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      ws[addr].s = {
        ...(ws[addr].s ?? {}),
        font: { ...(ws[addr].s?.font ?? {}), color: MISSING_SPEEDUP_FONT_COLOR },
      };
    }
  }
}

function buildDaySheet({
  schedule,
  waitlist,
  footer,
  missingSpeedupPlayerIds,
}: ExcelDaySheetData): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(schedule);

  const scheduleEndCol = 8; // A–I (Status)
  const scheduleLastRow = schedule.length; // header row 0 + data
  applyHeaderRowStyle(ws, 0, 0, scheduleEndCol);
  applySlotGridColumnStyle(ws, 0, 0, scheduleEndCol, scheduleLastRow);
  applyThousandsNumberFormat(
    ws,
    0,
    0,
    scheduleEndCol,
    scheduleLastRow,
    NUMERIC_COMMA_HEADERS
  );
  applyMissingSpeedupStyle(
    ws,
    0,
    0,
    scheduleEndCol,
    scheduleLastRow,
    MISSING_SPEEDUP_HEADERS,
    missingSpeedupPlayerIds
  );

  if (waitlist.length > 0) {
    XLSX.utils.sheet_add_json(ws, waitlist, {
      origin: { r: 0, c: EXCEL_WAITLIST_ORIGIN_COL },
      skipHeader: false,
    });
    const waitlistEndCol = EXCEL_WAITLIST_ORIGIN_COL + 5; // K–P (incl. Preferred time)
    const waitlistLastRow = waitlist.length;
    applyHeaderRowStyle(ws, 0, EXCEL_WAITLIST_ORIGIN_COL, waitlistEndCol);
    applyThousandsNumberFormat(
      ws,
      0,
      EXCEL_WAITLIST_ORIGIN_COL,
      waitlistEndCol,
      waitlistLastRow,
      NUMERIC_COMMA_HEADERS
    );
    applyMissingSpeedupStyle(
      ws,
      0,
      EXCEL_WAITLIST_ORIGIN_COL,
      waitlistEndCol,
      waitlistLastRow,
      MISSING_SPEEDUP_HEADERS,
      missingSpeedupPlayerIds
    );
  }

  if (footer) {
    // One blank row below the taller of schedule / waitlist, then title + table
    const titleRow = Math.max(schedule.length, waitlist.length) + 2;
    XLSX.utils.sheet_add_aoa(ws, [[footer.title]], {
      origin: { r: titleRow, c: 0 },
    });
    ws[XLSX.utils.encode_cell({ r: titleRow, c: 0 })].s = { font: HEADER_FONT };

    if (footer.rows.length > 0) {
      const headerRow = titleRow + 1;
      XLSX.utils.sheet_add_json(ws, footer.rows, {
        origin: { r: headerRow, c: 0 },
      });
      const footerEndCol = Object.keys(footer.rows[0]).length - 1;
      applyHeaderRowStyle(ws, headerRow, 0, footerEndCol);
      applyThousandsNumberFormat(
        ws,
        headerRow,
        0,
        footerEndCol,
        headerRow + footer.rows.length,
        NUMERIC_COMMA_HEADERS
      );
      applyMissingSpeedupStyle(
        ws,
        headerRow,
        0,
        footerEndCol,
        headerRow + footer.rows.length,
        FOOTER_MISSING_SPEEDUP_HEADERS,
        footer.missingSpeedupPlayerIds
      );
    }
  }

  return ws;
}

export function buildStyledExcelWorkbook(data: ExcelExportData): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  for (const [sheetName, day] of Object.entries(data.days)) {
    const ws = buildDaySheet(day);
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  }

  const summaryWs = XLSX.utils.json_to_sheet(data.summary);
  if (summaryWs["!ref"]) {
    const range = XLSX.utils.decode_range(summaryWs["!ref"]);
    applyHeaderRowStyle(summaryWs, range.s.r, range.s.c, range.e.c);
  }
  XLSX.utils.book_append_sheet(
    wb,
    summaryWs,
    EXPORT_SUMMARY_SHEET_NAME.slice(0, 31)
  );

  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}
