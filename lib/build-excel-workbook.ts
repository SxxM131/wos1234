import * as XLSX from "xlsx-js-style";
import { EXPORT_SUMMARY_SHEET_NAME } from "./export-grid";

/** Light green (연두색) fill for header row and slot grid columns */
const HEADER_FILL = { fgColor: { rgb: "C6EFCE" } };
const HEADER_FONT = { bold: true };

const SLOT_GRID_COLUMN_HEADERS = ["Day", "Slot start (UTC)"];

function applyHeaderRowStyle(ws: XLSX.WorkSheet) {
  if (!ws["!ref"]) return;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const headerRow = range.s.r;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: HEADER_FILL,
      font: HEADER_FONT,
      alignment: { vertical: "center", wrapText: true },
    };
  }
}

function findColumnIndices(ws: XLSX.WorkSheet, headers: string[]): number[] {
  if (!ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const headerRow = range.s.r;
  const indices: number[] = [];

  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    const header = ws[addr]?.v;
    if (typeof header === "string" && headers.includes(header)) {
      indices.push(c);
    }
  }

  return indices;
}

/** Day / Slot start data rows share the same green fill as the header. */
function applySlotGridColumnStyle(ws: XLSX.WorkSheet) {
  if (!ws["!ref"]) return;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const headerRow = range.s.r;
  const columnIndices = findColumnIndices(ws, SLOT_GRID_COLUMN_HEADERS);
  if (columnIndices.length === 0) return;

  for (let r = headerRow + 1; r <= range.e.r; r++) {
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

export function buildStyledExcelWorkbook(
  sheets: Record<string, Record<string, string | number>[]>
): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  for (const [sheetName, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows);
    applyHeaderRowStyle(ws);
    if (sheetName !== EXPORT_SUMMARY_SHEET_NAME) {
      applySlotGridColumnStyle(ws);
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  }

  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}
