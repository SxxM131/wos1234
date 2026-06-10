import * as XLSX from "xlsx-js-style";

/** Light green (연두색) fill for header row */
const HEADER_FILL = { fgColor: { rgb: "C6EFCE" } };
const HEADER_FONT = { bold: true };

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

export function buildStyledExcelWorkbook(
  sheets: Record<string, Record<string, string | number>[]>
): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  for (const [sheetName, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows);
    applyHeaderRowStyle(ws);
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  }

  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}
