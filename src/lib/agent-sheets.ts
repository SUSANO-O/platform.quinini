/**
 * Multi-sheet config helpers — Google Sheets públicos como herramienta LLM.
 *
 * Estructura en `tools[].config`:
 *   { sheets: [ { id, name, description, url, range? } ] }
 *
 * Cada entrada se expone al LLM como una tool MCP `mcp:landing:sheet:<name>`
 * que al invocarse descarga el CSV público y se lo entrega al modelo.
 */

export interface SheetEntry {
  id:          string;
  name:        string;   // snake_case, identificador para el LLM
  description: string;   // qué contiene el sheet — para que el LLM decida cuándo consultarlo
  url:         string;   // URL completa de Google Sheets (cualquier formato)
  range?:      string;   // opcional, ej. "Sheet1!A1:F50"
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
    out.push({
      id:          typeof e.id === 'string' && e.id ? e.id : generateSheetId(),
      name:        sanitizeSheetName(typeof e.name === 'string' ? e.name : 'sheet'),
      description: typeof e.description === 'string' ? e.description.trim() : '',
      url,
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
