/**
 * File parsers for imports. Handles XLSX and CSV uniformly.
 * Returns array of row objects keyed by header (trimmed, case preserved).
 */
import * as XLSX from 'xlsx';

export interface ParsedRow {
  rowNumber: number; // 1-indexed excluding header
  data: Record<string, string | number | null>;
}

export interface ParsedFile {
  headers: string[];
  rows: ParsedRow[];
  totalRows: number;
}

/**
 * Parse an uploaded file (XLSX or CSV) into a uniform row structure.
 * Empty rows are skipped. Empty cells become null.
 */
export function parseImportFile(buffer: Buffer, filename: string): ParsedFile {
  const ext = filename.toLowerCase().split('.').pop();
  if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
    throw new Error(`Unsupported file type: .${ext}. Use .xlsx, .xls, or .csv.`);
  }

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('File has no sheets.');

  const sheet = wb.Sheets[sheetName];
  // sheet_to_json with header: 1 returns arrays — header row first, then data
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null });
  if (rawRows.length === 0) throw new Error('File is empty.');

  const headerRow = rawRows[0] as unknown[];
  const headers = headerRow.map((h) => String(h ?? '').trim()).filter((h) => h.length > 0);
  if (headers.length === 0) throw new Error('No headers found in first row.');

  const rows: ParsedRow[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const raw = rawRows[i] as unknown[];
    // Skip fully-empty rows
    if (!raw || raw.every((v) => v == null || String(v).trim() === '')) continue;

    const data: Record<string, string | number | null> = {};
    headers.forEach((h, idx) => {
      const v = raw[idx];
      if (v == null || (typeof v === 'string' && v.trim() === '')) {
        data[h] = null;
      } else if (typeof v === 'number') {
        data[h] = v;
      } else if (v instanceof Date) {
        data[h] = v.toISOString();
      } else {
        data[h] = String(v).trim();
      }
    });

    rows.push({ rowNumber: i, data });
  }

  return { headers, rows, totalRows: rows.length };
}
