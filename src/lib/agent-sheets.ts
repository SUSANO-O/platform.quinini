/**
 * Multi-sheet config helpers — Google Sheets públicos como herramienta LLM.
 *
 * Estructura en `tools[].config`:
 *   { sheets: [ { id, name, description, url, range? } ] }
 *
 * Cada entrada se expone al LLM como una tool MCP `mcp:landing:sheet:<name>`
 * que al invocarse descarga el CSV público y se lo entrega al modelo.
 */

export interface SheetTab {
  gid: string;
  title: string;
}

export interface SheetEntry {
  id:          string;
  name:        string;   // snake_case, identificador para el LLM
  description: string;   // cuándo consultar esta hoja
  matrixNeed?: string;   // qué columnas/datos extraer de la matriz
  url:         string;   // URL completa de Google Sheets (cualquier formato)
  tabTitle?:   string;   // nombre visible de la pestaña en Google
  tabGid?:     string;   // gid de la pestaña elegida
  range?:      string;   // opcional, ej. "Inventario!A1:F50"
  /** Sync nocturno 3 AM → Mongo (Plus+). Default false. */
  nightlySyncEnabled?: boolean;
  /** Cabeceras por las que filtrar la matriz; vacío = todas. */
  filterHeaders?: string[];
}

/** Sanea nombre a identificador LLM-safe. */
export function sanitizeSheetName(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'sheet';
}

/** Id único corto. */
export function generateSheetId(): string {
  return 'sh_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Hoja demo BD_Repuestos_300k — fixture de laboratorio, no inventario de producto. */
export const FIXTURE_REPUESTOS_SPREADSHEET_ID = '1-VXSM_Fd1mAb2WX_m67PYifzPD5mUqICXMG4IUOF3QE';

export function isFixtureRepuestosSheet(entry: { url?: string } | null | undefined): boolean {
  const id = extractSpreadsheetId(String(entry?.url || ''));
  return id === FIXTURE_REPUESTOS_SPREADSHEET_ID;
}

type LandingToolRow = {
  toolId: string;
  config?: { sheets?: Array<{ url?: string }> };
};

/** Quita la CSV de 300k del agente de producto. Deja otras hojas del cliente. */
export function stripFixtureRepuestosSheets<T extends LandingToolRow>(tools: T[]): T[] {
  const out: T[] = [];
  for (const tool of tools) {
    if (tool.toolId !== 'google-sheets') {
      out.push(tool);
      continue;
    }
    const sheets = Array.isArray(tool.config?.sheets) ? tool.config.sheets : [];
    const kept = sheets.filter((s) => !isFixtureRepuestosSheet(s));
    if (!kept.length) continue;
    out.push({
      ...tool,
      config: { ...(tool.config || {}), sheets: kept },
    });
  }
  return out;
}

/** Extrae el spreadsheetId de cualquier formato de URL de Google Sheets. */
export function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  // /spreadsheets/d/{ID}/...
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m && m[1]) return m[1];
  // Solo el ID directo
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim())) return url.trim();
  return null;
}

/** Extrae el gid (id del sheet/tab dentro del archivo). */
export function extractGid(url: string): string | null {
  if (!url) return null;
  const m = url.match(/[#?&]gid=(\d+)/);
  return m && m[1] ? m[1] : null;
}

/** URL de edición con pestaña opcional. */
export function buildSpreadsheetUrl(spreadsheetId: string, gid?: string | null): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return gid ? `${base}#gid=${gid}` : base;
}

/** Aplica gid/título de pestaña a una URL de spreadsheet. */
export function applyTabToUrl(url: string, tab: Pick<SheetTab, 'gid' | 'title'>): string {
  const id = extractSpreadsheetId(url);
  if (!id) return url.trim();
  return buildSpreadsheetUrl(id, tab.gid);
}

/** Texto combinado para la tool del LLM (cuándo + qué extraer). */
export function formatSheetToolDescription(
  entry: Pick<SheetEntry, 'description' | 'matrixNeed' | 'tabTitle' | 'name' | 'filterHeaders'>,
): string {
  const parts: string[] = [];
  if (entry.tabTitle?.trim()) parts.push(`Pestaña: "${entry.tabTitle.trim()}".`);
  const when = entry.description?.trim();
  if (when) parts.push(`CUÁNDO USAR: ${when}`);
  const need = entry.matrixNeed?.trim();
  if (need) parts.push(`QUÉ NECESITAS DE LA MATRIZ: ${need}`);
  const headers = normalizeFilterHeaders(entry.filterHeaders);
  if (headers.length) parts.push(`FILTRAR POR CABECERAS: ${headers.join(', ')}`);
  return parts.join('\n\n') || `Hoja ${entry.name}`;
}

export function normalizeFilterHeaders(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const h of raw) {
    if (typeof h !== 'string') continue;
    const t = h.trim();
    if (!t) continue;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
  }
  return out;
}

function decodeJsQuotedString(raw: string): string {
  try {
    return JSON.parse(`"${raw.replace(/\\/g, '\\\\')}"`) as string;
  } catch {
    return raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}

function pushUniqueTab(tabs: SheetTab[], seen: Set<string>, gid: string, title: string): void {
  const g = gid.trim();
  const t = title.trim();
  if (!g || !t || seen.has(g)) return;
  seen.add(g);
  tabs.push({ gid: g, title: t });
}

/**
 * Parsea pestañas desde el HTML público de Google Sheets (sin API key).
 * Requiere que el archivo esté compartido como "Cualquiera con el link puede ver".
 */
export function parseSpreadsheetTabsFromHtml(html: string): SheetTab[] {
  const tabs: SheetTab[] = [];
  const seen = new Set<string>();

  // Formato bootstrap clásico en /edit
  const legacyRe = /"sheetId":(\d+),"title":"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = legacyRe.exec(html)) !== null) {
    pushUniqueTab(tabs, seen, m[1]!, decodeJsQuotedString(m[2]!));
  }
  if (tabs.length) return tabs;

  // Formato htmlview (2024+): items.push({name: "...", gid: "123", ...})
  const htmlViewRe = /items\.push\(\{name:\s*"((?:\\.|[^"\\])*)",[^}]*\bgid:\s*"(\d+)"/g;
  while ((m = htmlViewRe.exec(html)) !== null) {
    pushUniqueTab(tabs, seen, m[2]!, decodeJsQuotedString(m[1]!));
  }
  if (tabs.length) return tabs;

  // Variante suelta name + gid en el mismo bloque JS
  const looseRe = /name:\s*"((?:\\.|[^"\\])*)"[^}]*\bgid:\s*"(\d+)"/g;
  while ((m = looseRe.exec(html)) !== null) {
    pushUniqueTab(tabs, seen, m[2]!, decodeJsQuotedString(m[1]!));
  }

  return tabs;
}

/** Lista pestañas de un spreadsheet público. */
export async function fetchPublicSpreadsheetTabs(
  spreadsheetId: string,
): Promise<{ tabs: SheetTab[]; error?: string }> {
  const fetchOpts = {
    method: 'GET' as const,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Botiva-SheetsTabList/2.0)' },
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow' as const,
  };
  const candidates = [
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`,
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`,
  ];

  let lastHttpError = '';
  try {
    for (const url of candidates) {
      const res = await fetch(url, fetchOpts);
      if (!res.ok) {
        lastHttpError = `HTTP ${res.status}`;
        continue;
      }
      const html = await res.text();
      const tabs = parseSpreadsheetTabsFromHtml(html);
      if (tabs.length > 0) return { tabs };
    }

    if (lastHttpError) {
      return {
        tabs: [],
        error: `No accesible (${lastHttpError}). Comparte el archivo como "Cualquiera con el enlace puede ver".`,
      };
    }
    return { tabs: [], error: 'No se detectaron pestañas. Verifica que el enlace sea público.' };
  } catch (e) {
    return { tabs: [], error: e instanceof Error ? e.message : 'Error al conectar con Google Sheets' };
  }
}

/** Construye la URL pública de export CSV. Funciona con sheets "Anyone with the link can view". */
export function buildCsvUrl(sheetUrl: string): string | null {
  const id = extractSpreadsheetId(sheetUrl);
  if (!id) return null;
  const gid = extractGid(sheetUrl);
  const base = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
  return gid ? `${base}&gid=${gid}` : base;
}

type ToolConfigShape = { sheets?: unknown };

/**
 * Extrae las entradas de sheets del config del tool.
 * @param opts.includeIncomplete — si true, incluye entradas con URL vacía (para UI edición).
 */
export function extractSheetEntries(
  rawConfig: unknown,
  opts: { includeIncomplete?: boolean } = {},
): SheetEntry[] {
  if (!rawConfig || typeof rawConfig !== 'object') return [];
  const cfg = rawConfig as ToolConfigShape;
  if (!Array.isArray(cfg.sheets)) return opts.includeIncomplete ? [] : [];

  const out: SheetEntry[] = [];
  for (const s of cfg.sheets) {
    if (!s || typeof s !== 'object') continue;
    const e = s as Record<string, unknown>;
    const url = typeof e.url === 'string' ? e.url.trim() : '';
    if (!url && !opts.includeIncomplete) continue;
    const tabGid =
      typeof e.tabGid === 'string' && e.tabGid.trim()
        ? e.tabGid.trim()
        : (extractGid(url) ?? undefined);
    const tabTitle = typeof e.tabTitle === 'string' ? e.tabTitle.trim() : '';
    out.push({
      id:          typeof e.id === 'string' && e.id ? e.id : generateSheetId(),
      name:        sanitizeSheetName(typeof e.name === 'string' ? e.name : 'sheet'),
      description: typeof e.description === 'string' ? e.description.trim() : '',
      url,
      ...(typeof e.matrixNeed === 'string' && e.matrixNeed.trim() ? { matrixNeed: e.matrixNeed.trim() } : {}),
      ...(tabTitle ? { tabTitle } : {}),
      ...(tabGid ? { tabGid } : {}),
      ...(typeof e.range === 'string' && e.range.trim() ? { range: e.range.trim() } : {}),
      nightlySyncEnabled: e.nightlySyncEnabled === true,
      ...(normalizeFilterHeaders(e.filterHeaders).length
        ? { filterHeaders: normalizeFilterHeaders(e.filterHeaders) }
        : {}),
    });
  }
  return out;
}

/** Todos los sheets configurados en el agente. */
export function extractAgentSheets(agent: {
  tools?: Array<{ toolId?: string; config?: unknown }> | null;
} | null | undefined): SheetEntry[] {
  if (!agent?.tools?.length) return [];
  const out: SheetEntry[] = [];
  for (const t of agent.tools) {
    if (t?.toolId !== 'google-sheets') continue;
    out.push(...extractSheetEntries(t.config));
  }
  return out;
}

/** Ancho por defecto: 26 columnas. ZZ (702) truncaba el CSV y cortaba el sync. */
export const SHEET_GVIZ_DEFAULT_MAX_COL = 'Z';

export const SHEET_DATA_FALLBACK_HEADER = [
  'referencia',
  'categoria',
  'descripcion',
  'oem',
  'marca_repuesto',
  'marca_vehiculo',
  'modelo',
  'anios',
  'estado',
  'stock',
  'costo',
  'precio_lista',
  'sede',
  'fecha',
  'nota',
] as const;

/** Primera celda tipo REP-0000004: es fila de datos, no encabezado. */
export function looksLikeSheetDataRow(cells: string[] | undefined): boolean {
  const first = String(cells?.[0] || '').trim();
  return /^REP-\d+/i.test(first);
}

/** Rango A1 para paginación de sync/fetch parcial. */
export function sheetDataRowsToA1Range(
  fromRow: number,
  toRowExclusive: number,
  maxCol = SHEET_GVIZ_DEFAULT_MAX_COL,
): string {
  const start = Math.max(0, Math.floor(fromRow)) + 2;
  const end = Math.max(start, Math.floor(toRowExclusive) + 1);
  return `A${start}:${maxCol}${end}`;
}

export function buildGvizCsvUrl(params: {
  spreadsheetId: string;
  gid?: string | null;
  sheetName?: string | null;
  range?: string;
}): string {
  const u = new URL(`https://docs.google.com/spreadsheets/d/${params.spreadsheetId}/gviz/tq`);
  u.searchParams.set('tqx', 'out:csv');
  if (params.gid) u.searchParams.set('gid', params.gid);
  else if (params.sheetName) u.searchParams.set('sheet', params.sheetName);
  if (params.range) u.searchParams.set('range', params.range);
  return u.toString();
}

export function parseSheetHeaderRow(csv: string): string[] {
  const first = String(csv || '').split(/\r?\n/).find((l) => l.trim()) ?? '';
  return parseCsvLine(first).map((c) => c.trim()).filter(Boolean);
}

export async function fetchPublicSpreadsheetHeaders(params: {
  spreadsheetId: string;
  gid?: string | null;
}): Promise<{ headers: string[]; error?: string }> {
  const url = buildGvizCsvUrl({
    spreadsheetId: params.spreadsheetId,
    gid: params.gid,
    range: `A1:${SHEET_GVIZ_DEFAULT_MAX_COL}8`,
  });
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Botiva-SheetsHeaders/1.0)' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });
    if (!res.ok) {
      return { headers: [], error: `No accesible (HTTP ${res.status}). ¿El archivo es público?` };
    }
    const csv = await res.text();
    const headers = resolveSheetFilterHeaders(csv);
    if (!headers.length) return { headers: [], error: 'No se leyeron cabeceras de la pestaña.' };
    return { headers };
  } catch (e) {
    return { headers: [], error: e instanceof Error ? e.message : 'Error al leer cabeceras' };
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Parsea CSV simple en header + filas. */
export function parseSimpleCsv(csv: string): { header: string[]; rows: string[][] } {
  const lines = csv.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]!);
  const rows = lines.slice(1).map(parseCsvLine);
  return { header, rows };
}

function fallbackHeaderForWidth(width: number): string[] {
  const base: string[] = [...SHEET_DATA_FALLBACK_HEADER];
  while (base.length < width) base.push(`col_${base.length + 1}`);
  return base.slice(0, Math.max(width, 1));
}

/** Primera celda tipo SKU / TIPO: es encabezado, no un ítem. */
export function looksLikeSheetHeaderRow(cells: string[] | undefined): boolean {
  if (!cells?.length) return false;
  if (looksLikeSheetDataRow(cells)) return false;
  const first = String(cells[0] || '').trim();
  if (!first) return false;
  if (/^\d+$/.test(first)) return false;
  if (/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(first) && /\d/.test(first)) return false;
  return /[\p{L}]{2,}/u.test(first);
}

/** Cabeceras reales de la hoja; nunca una fila REP-* / ítem. */
export function resolveSheetFilterHeaders(csv: string): string[] {
  const lines = String(csv || '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const records = lines.map((l) => parseCsvLine(l).map((c) => c.trim()));
  for (const row of records) {
    if (!looksLikeSheetHeaderRow(row)) continue;
    const headers = row.filter(Boolean);
    if (headers.length) return headers;
  }
  const width = records[0]?.length ?? 0;
  return fallbackHeaderForWidth(width);
}

/**
 * Parsea un trozo gviz/CSV.
 * `includeHeader=false` (chunks 2..n): TODAS las líneas son datos.
 * Si no, una primera fila REP-* se mueve a datos con encabezado sintético.
 */
export function parseGvizCsvChunk(
  csv: string,
  includeHeader: boolean,
): { header: string[]; rows: string[][]; lineCount: number } {
  const lines = csv.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return { header: [], rows: [], lineCount: 0 };
  const records = lines.map(parseCsvLine);
  if (!includeHeader) {
    return { header: [], rows: records, lineCount: records.length };
  }
  const first = records[0]!;
  if (looksLikeSheetDataRow(first)) {
    return { header: fallbackHeaderForWidth(first.length), rows: records, lineCount: records.length };
  }
  return { header: first, rows: records.slice(1), lineCount: records.length };
}

/** Partir filas para no pasar el tope de 16MB por documento Mongo. */
export function splitSheetRowsForMongo(rows: string[][], chunkSize = 4000): string[][][] {
  const size = Math.max(1, Math.floor(chunkSize));
  const out: string[][][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out.length ? out : [[]];
}

export function agentHasAnySheet(agent: {
  tools?: Array<{ toolId?: string; config?: unknown }> | null;
} | null | undefined): boolean {
  return extractAgentSheets(agent).length > 0;
}
