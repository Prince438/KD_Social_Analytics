import Papa from "papaparse";
import ExcelJS from "exceljs";

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

/** Coerce an ExcelJS cell value to a plain string. */
function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    // Rich text, hyperlinks, formula results.
    const v = value as { text?: string; result?: unknown; hyperlink?: string };
    if (typeof v.text === "string") return v.text;
    if (v.result != null) return String(v.result);
    if (typeof v.hyperlink === "string") return v.hyperlink;
    return "";
  }
  return String(value);
}

/** Parses a CSV string into headers + row objects. */
export function parseCsv(text: string): ParsedTable {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = (result.meta.fields ?? []).filter(Boolean);
  return { headers, rows: result.data };
}

/** Parses the first worksheet of an XLSX buffer into headers + row objects. */
export async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedTable> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col - 1] = cellToString(cell.value).trim();
  });

  const rows: Record<string, string>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string> = {};
    row.eachCell((cell, col) => {
      const key = headers[col - 1];
      if (key) obj[key] = cellToString(cell.value);
    });
    if (Object.keys(obj).length > 0) rows.push(obj);
  });

  return { headers: headers.filter(Boolean), rows };
}

/** Parses an uploaded file by extension/content type. */
export async function parseFile(
  filename: string,
  buffer: ArrayBuffer,
): Promise<ParsedTable> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return parseXlsx(buffer);
  }
  const text = new TextDecoder().decode(buffer);
  return parseCsv(text);
}
