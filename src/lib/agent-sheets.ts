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
  entry: Pick<SheetEntry, 'description' | 'matrixNeed' | 'tabTitle' | 'name'>,
): string {
  const parts: string[] = [];
  if (entry.tabTitle?.trim()) parts.push(`Pestaña: "${entry.tabTitle.trim()}".`);
  const when = entry.description?.trim();
  if (when) parts.push(`CUÁNDO USAR: ${when}`);
  const need = entry.matrixNeed?.trim();
  if (need) parts.push(`QUÉ NECESITAS DE LA MATRIZ: ${need}`);
  return parts.join('\n\n') || `Hoja ${entry.name}`;
}

/**
 * Parsea pestañas desde el HTML público de Google Sheets (sin API key).
 * Requiere que el archivo esté compartido como "Cualquiera con el link puede ver".
 */
export function parseSpreadsheetTabsFromHtml(html: string): SheetTab[] {
  const tabs: SheetTab[] = [];
  const seen = new Set<string>();
  const re = /"sheetId":(\d+),"title":"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const gid = m[1]!;
    if (seen.has(gid)) continue;
    seen.add(gid);
    let title = m[2]!;
    try {
      title = JSON.parse(`"${title.replace(/\\/g, '\\\\')}"`) as string;
    } catch {
      title = title.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    tabs.push({ gid, title });
  }
  return tabs;
}

/** Lista pestañas de un spreadsheet público. */
export async function fetchPublicSpreadsheetTabs(
  spreadsheetId: string,
): Promise<{ tabs: SheetTab[]; error?: string }> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Botiva-SheetsTabList/1.0' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });
    if (!res.ok) {
      return {
        tabs: [],
        error: `No accesible (HTTP ${res.status}). Comparte el archivo como "Cualquiera con el enlace puede ver".`,
      };
    }
    const html = await res.text();
    const tabs = parseSpreadsheetTabsFromHtml(html);
    if (tabs.length === 0) {
      return { tabs: [], error: 'No se detectaron pestañas. Verifica que el enlace sea público.' };
    }
    return { tabs };
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

export function agentHasAnySheet(agent: {
  tools?: Array<{ toolId?: string; config?: unknown }> | null;
} | null | undefined): boolean {
  return extractAgentSheets(agent).length > 0;
}
