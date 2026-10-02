/**
 * Mapa de la app de un widget (`Widget.appMap`): qué vistas tiene la web del cliente, para qué
 * sirve cada una y sus pestañas (#). Es dato, no prompt: se edita en el panel, por API/CLI o
 * importando CSV/JSON, y se inyecta solo en cada mensaje (`appMapContextBlock`).
 *
 * El autodescubrimiento (`pageVisitFromPagePath`) guarda qué páginas visitan los usuarios reales
 * —ruta, NOMBRES de parámetros y pestaña, nunca valores— para proponer el mapa a la empresa.
 */

import { SENSITIVE_PARAM_RE } from '@/lib/widget-page-nav';

export type AppMapTab = { hash: string; name: string; description?: string };
export type AppMapEntry = { path: string; name: string; description?: string; tabs?: AppMapTab[] };

export const APP_MAP_MAX_ENTRIES = 300;
export const APP_MAP_MAX_TABS = 40;
const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;
const MAX_PATH = 200;
const PATH_RE = /^\/[A-Za-z0-9_\-./]*$/;
const HASH_RE = /^[A-Za-z0-9_\-]{1,60}$/;
/** Presupuesto por defecto del bloque inyectado (el hub admite 32k en sessionContextBlock). */
export const APP_MAP_CONTEXT_BUDGET = 12_000;

/** Pathname de una ruta relativa o URL absoluta; '' si no es utilizable. */
export function appMapPathname(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return '';
  let pathname: string;
  try {
    if (/^https?:\/\//i.test(v)) pathname = new URL(v).pathname;
    else if (v.startsWith('/') && !v.startsWith('//') && !v.includes('\\')) pathname = new URL(v, 'https://x.invalid').pathname;
    else return '';
  } catch {
    return '';
  }
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  return pathname.length <= MAX_PATH && PATH_RE.test(pathname) ? pathname : '';
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function normalizeTabs(raw: unknown): AppMapTab[] {
  if (!Array.isArray(raw)) return [];
  const out: AppMapTab[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    const hash = text(o.hash, 61).replace(/^#/, '');
    const name = text(o.name, MAX_NAME);
    if (!HASH_RE.test(hash) || !name || seen.has(hash)) continue;
    seen.add(hash);
    const description = text(o.description, MAX_DESCRIPTION);
    out.push({ hash, name, ...(description ? { description } : {}) });
    if (out.length >= APP_MAP_MAX_TABS) break;
  }
  return out;
}

/** Valida y limpia un mapa (de JSON, del panel o de la API). Nunca lanza. */
export function normalizeAppMap(raw: unknown): { map: AppMapEntry[]; errors: string[] } {
  if (!Array.isArray(raw)) return { map: [], errors: ['El mapa debe ser una lista de vistas.'] };
  const map: AppMapEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const row = i + 1;
    if (!item || typeof item !== 'object') {
      errors.push(`Fila ${row}: no es un objeto.`);
      return;
    }
    const o = item as Record<string, unknown>;
    const path = appMapPathname(o.path);
    const name = text(o.name, MAX_NAME);
    if (!path) {
      errors.push(`Fila ${row}: ruta inválida (debe empezar por / y ser del mismo sitio).`);
      return;
    }
    if (!name) {
      errors.push(`Fila ${row} (${path}): falta el nombre.`);
      return;
    }
    if (seen.has(path)) return;
    if (map.length >= APP_MAP_MAX_ENTRIES) {
      if (!errors.some((e) => e.startsWith('Máximo'))) errors.push(`Máximo ${APP_MAP_MAX_ENTRIES} vistas; el resto se ignoró.`);
      return;
    }
    seen.add(path);
    const description = text(o.description, MAX_DESCRIPTION);
    const tabs = normalizeTabs(o.tabs);
    map.push({ path, name, ...(description ? { description } : {}), ...(tabs.length ? { tabs } : {}) });
  });
  return { map, errors };
}

// ── CSV ────────────────────────────────────────────────────────────────────────

const CSV_HEADER = ['path', 'name', 'description', 'tab_hash', 'tab_name', 'tab_description'] as const;
type CsvCol = (typeof CSV_HEADER)[number];

const HEADER_ALIASES: Record<string, CsvCol> = {
  path: 'path', ruta: 'path', url: 'path',
  name: 'name', nombre: 'name',
  description: 'description', descripcion: 'description',
  tab_hash: 'tab_hash', tab: 'tab_hash', pestana: 'tab_hash', ancla: 'tab_hash',
  tab_name: 'tab_name', nombre_pestana: 'tab_name',
  tab_description: 'tab_description', descripcion_pestana: 'tab_description',
};

function csvCell(v: string | undefined): string {
  const s = v ?? '';
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Una fila por vista y una fila extra por pestaña (solo con la ruta y las columnas tab_*). */
export function appMapToCsv(map: AppMapEntry[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const e of map) {
    lines.push([e.path, e.name, e.description, '', '', ''].map(csvCell).join(','));
    for (const t of e.tabs ?? []) lines.push([e.path, '', '', t.hash, t.name, t.description].map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

function parseCsvRows(src: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function headerKey(h: string): string {
  return h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
}

export function appMapFromCsv(csv: string): { map: AppMapEntry[]; errors: string[] } {
  const src = String(csv ?? '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows = parseCsvRows(src, sep);
  if (!rows.length) return { map: [], errors: ['El CSV está vacío.'] };
  const cols = rows[0].map((h) => HEADER_ALIASES[headerKey(h)]);
  if (!cols.includes('path')) return { map: [], errors: ['Falta la columna "path" (o "ruta").'] };

  const byPath = new Map<string, { path: string; name?: string; description?: string; tabs: AppMapTab[] }>();
  for (const r of rows.slice(1)) {
    const rec: Partial<Record<CsvCol, string>> = {};
    cols.forEach((c, i) => { if (c) rec[c] = (r[i] ?? '').trim(); });
    const key = rec.path ?? '';
    const entry = byPath.get(key) ?? { path: key, tabs: [] };
    if (rec.name && !entry.name) entry.name = rec.name;
    if (rec.description && !entry.description) entry.description = rec.description;
    if (rec.tab_hash) {
      entry.tabs.push({ hash: rec.tab_hash, name: rec.tab_name || rec.tab_hash, ...(rec.tab_description ? { description: rec.tab_description } : {}) });
    }
    byPath.set(key, entry);
  }
  return normalizeAppMap([...byPath.values()]);
}

// ── Contexto para el agente ────────────────────────────────────────────────────

function hashOf(pagePath: string): string {
  const i = pagePath.indexOf('#');
  const h = i >= 0 ? pagePath.slice(i + 1).trim() : '';
  return HASH_RE.test(h) ? h : '';
}

function entryLine(e: AppMapEntry): string {
  const head = `- ${e.path} — ${e.name}${e.description ? `: ${e.description}` : ''}`;
  if (!e.tabs?.length) return head;
  return `${head}\n  Pestañas (${e.path}?…#ancla): ${e.tabs.map((t) => `#${t.hash} ${t.name}`).join('; ')}`;
}

/**
 * Bloque de contexto: vista y pestaña actuales (con su descripción) + catálogo de vistas para
 * navegar. Vacío si el widget no tiene mapa (comportamiento previo intacto).
 */
export function appMapContextBlock(
  map: AppMapEntry[] | undefined | null,
  pagePath: string | undefined | null,
  budget = APP_MAP_CONTEXT_BUDGET,
): string {
  if (!Array.isArray(map) || !map.length) return '';
  const raw = String(pagePath ?? '');
  const current = appMapPathname(raw);
  const entry = current ? map.find((e) => e.path === current) : undefined;

  const head: string[] = [];
  if (entry) {
    head.push(`Vista actual: ${entry.name} (${entry.path})${entry.description ? ` — ${entry.description}` : ''}`);
    const h = hashOf(raw);
    const tab = h ? entry.tabs?.find((t) => t.hash === h) : undefined;
    if (tab) head.push(`Pestaña actual: ${tab.name} (#${tab.hash})${tab.description ? ` — ${tab.description}` : ''}`);
    if (entry.tabs?.length) {
      head.push(
        'Pestañas de esta vista:\n' +
          entry.tabs.map((t) => `  #${t.hash} ${t.name}${t.description ? ` — ${t.description}` : ''}`).join('\n'),
      );
    }
  } else if (current) {
    head.push(`Vista actual: ${current} (no está en el mapa de la app).`);
  }

  const intro =
    '[MAPA DE LA APP] Vistas reales de esta aplicación. Para llevar al cliente usa SOLO estas rutas en el bloque assist-nav (conserva los parámetros de la página actual cuando cambies de pestaña). Nombra las vistas por su nombre, no por la ruta.';
  let out = [...head, intro].join('\n');
  if (out.length > budget) return out.slice(0, budget);
  let omitted = 0;
  for (const e of map) {
    const line = '\n' + entryLine(e);
    if (out.length + line.length > budget - 60) { omitted++; continue; }
    out += line;
  }
  if (omitted) out += `\n(… ${omitted} vistas más no listadas por espacio)`;
  return out.slice(0, budget);
}

// ── Autodescubrimiento ─────────────────────────────────────────────────────────

export type PageVisit = { path: string; paramKeys: string[]; hash: string };

/** Lo que se guarda de una visita: ruta, nombres de parámetros (sin valores) y pestaña. */
export function pageVisitFromPagePath(pagePath: unknown): PageVisit | null {
  const raw = typeof pagePath === 'string' ? pagePath.trim() : '';
  const path = appMapPathname(raw);
  if (!path) return null;
  let keys: string[] = [];
  try {
    const u = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(raw, 'https://x.invalid');
    keys = [...new Set([...u.searchParams.keys()])]
      .filter((k) => /^[A-Za-z0-9_\-]{1,40}$/.test(k) && !SENSITIVE_PARAM_RE.test(k))
      .sort()
      .slice(0, 20);
  } catch { /* noop */ }
  return { path, paramKeys: keys, hash: hashOf(raw) };
}
