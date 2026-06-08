/**
 * Lectura de snapshots Mongo para consultas sin ir a Google.
 */

export interface FetchSheetOpts {
  from_row?: number;
  to_row?: number;
  search?: string;
}

export interface FetchSheetResult {
  ok: boolean;
  csv?: string;
  totalRows?: number;
  returnedRows?: number;
  rangeStart?: number;
  rangeEnd?: number;
  isPreview?: boolean;
  truncated?: boolean;
  bytes?: number;
  hint?: string;
  error?: string;
}

export type SheetSnapshotDoc = {
  header: string[];
  rows: string[][];
  byteSize?: number;
  rowCount?: number;
  syncedAt?: Date | string;
};

const PREVIEW_ROWS = 5;
const MAX_RANGE_ROWS = 200;
const MAX_SHEET_CHARS = 15_000;
const SEARCH_LIMIT = 50;

function rowsToCsv(header: string[], dataRows: string[][]): string {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(',')];
  for (const row of dataRows) lines.push(row.map(esc).join(','));
  return lines.join('\n');
}

function filterRowsBySearch(rows: string[][], term: string, limit: number): string[][] {
  const q = term.toLowerCase();
  const out: string[][] = [];
  for (const row of rows) {
    if (row.some((cell) => String(cell).toLowerCase().includes(q))) {
      out.push(row);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function readSheetFromSnapshot(
  snap: SheetSnapshotDoc,
  opts: FetchSheetOpts = {},
): FetchSheetResult {
  const header = Array.isArray(snap.header) ? snap.header : [];
  const allRows = Array.isArray(snap.rows) ? snap.rows : [];
  const search = typeof opts.search === 'string' ? opts.search.trim() : '';
  const isRange = typeof opts.from_row === 'number' || typeof opts.to_row === 'number';

  if (search) {
    const matched = filterRowsBySearch(allRows, search, SEARCH_LIMIT);
    let csv = rowsToCsv(header, matched);
    let truncated = false;
    if (csv.length > MAX_SHEET_CHARS) {
      csv = csv.slice(0, MAX_SHEET_CHARS);
      truncated = true;
    }
    return {
      ok: true,
      csv,
      totalRows: allRows.length,
      returnedRows: matched.length,
      isPreview: false,
      truncated,
      hint: `Búsqueda "${search}" en snapshot local (${matched.length} filas). Último sync: ${snap.syncedAt ? new Date(snap.syncedAt).toISOString() : 'n/a'}.`,
    };
  }

  if (isRange) {
    const from = Math.max(0, Math.floor(opts.from_row ?? 0));
    let to = Math.floor(opts.to_row ?? from + 50);
    if (to <= from) to = from + 50;
    if (to - from > MAX_RANGE_ROWS) to = from + MAX_RANGE_ROWS;
    const sliced = allRows.slice(from, to);
    let csv = rowsToCsv(header, sliced);
    let truncated = false;
    if (csv.length > MAX_SHEET_CHARS) {
      csv = csv.slice(0, MAX_SHEET_CHARS);
      truncated = true;
    }
    return {
      ok: true,
      csv,
      totalRows: allRows.length,
      returnedRows: sliced.length,
      rangeStart: from,
      rangeEnd: from + sliced.length,
      isPreview: false,
      truncated,
      hint: `Snapshot local filas ${from}-${from + sliced.length} de ${allRows.length}.`,
    };
  }

  const preview = allRows.slice(0, PREVIEW_ROWS);
  const csv = rowsToCsv(header, preview);
  return {
    ok: true,
    csv,
    totalRows: allRows.length,
    returnedRows: preview.length,
    isPreview: true,
    hint:
      `VISTA PREVIA desde snapshot Mongo (${preview.length} de ${allRows.length} filas). ` +
      `Datos de las 3 AM. Usa { search } o paginación.`,
  };
}

export function isSnapshotFresh(syncedAt: Date | string | undefined, maxAgeHours = 26): boolean {
  if (!syncedAt) return false;
  const t = new Date(syncedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < maxAgeHours * 60 * 60 * 1000;
}
