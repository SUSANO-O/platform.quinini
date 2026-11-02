/**
 * Persistencia del mapa de la app y del autodescubrimiento (ver `widget-app-map.ts`).
 *
 * - `recordWidgetPageVisit`: best-effort, nunca lanza. Topes: 500 rutas por widget y 60 pestañas /
 *   40 nombres de parámetro por ruta (el token del widget es público: alguien podría inflarlo).
 * - `getWidgetAppMap`: lectura con caché en memoria de 60 s (un cambio en el panel tarda ≤ 1 min).
 */

import { after } from 'next/server';
import { Widget, WidgetPageVisit } from '@/lib/db/models';
import {
  learnedSectionFromScreen,
  normalizeAppMap,
  pageVisitFromPagePath,
  withLearnedSections,
  type AppMapEntry,
  type LearnedScreenRow,
} from '@/lib/widget-app-map';

export const MAX_DISCOVERED_PATHS = 500;
const MAX_HASHES = 60;
const MAX_PARAM_KEYS = 40;

export async function recordWidgetPageVisit(params: {
  widgetId: string;
  userId: string;
  pagePath: unknown;
  /** "Leer la pantalla": de aquí se aprende el nombre de la sección (#hash) en la que está. */
  screenContext?: unknown;
}): Promise<void> {
  try {
    const visit = pageVisitFromPagePath(params.pagePath);
    if (!visit || !params.widgetId || !params.userId) return;
    const now = new Date();
    const key = { widgetId: params.widgetId, path: visit.path };

    const r = await WidgetPageVisit.updateOne(key, { $inc: { visits: 1 }, $set: { lastSeenAt: now } });
    if (!r.matchedCount) {
      if ((await WidgetPageVisit.countDocuments({ widgetId: params.widgetId })) >= MAX_DISCOVERED_PATHS) return;
      try {
        await WidgetPageVisit.updateOne(
          key,
          { $inc: { visits: 1 }, $set: { lastSeenAt: now }, $setOnInsert: { userId: params.userId, firstSeenAt: now } },
          { upsert: true },
        );
      } catch (e) {
        // Dos visitas simultáneas a una ruta nueva: la segunda choca con el índice único.
        if ((e as { code?: number })?.code !== 11000) throw e;
        await WidgetPageVisit.updateOne(key, { $inc: { visits: 1 } });
      }
    }
    if (visit.hash) {
      await WidgetPageVisit.updateOne(
        { ...key, [`hashes.${MAX_HASHES - 1}`]: { $exists: false } },
        { $addToSet: { hashes: visit.hash } },
      );
    }
    // Nombre de la sección: solo para hashes ya registrados (tope 60) y widgets con "Leer la pantalla".
    const learned = visit.hash ? learnedSectionFromScreen(params.pagePath, params.screenContext) : null;
    if (learned && (await getWidgetScreenContextEnabled(params.widgetId))) {
      await WidgetPageVisit.updateOne(
        { ...key, hashes: learned.hash },
        { $set: { [`sections.${learned.hash}`]: learned.name } },
      );
    }
    if (visit.paramKeys.length) {
      await WidgetPageVisit.updateOne(
        { ...key, [`paramKeys.${MAX_PARAM_KEYS - 1}`]: { $exists: false } },
        { $addToSet: { paramKeys: { $each: visit.paramKeys } } },
      );
    }
  } catch (err) {
    console.warn('[widget-page-visits] record skipped:', err);
  }
}

/** Registra la visita después de responder (after() garantiza que termine en serverless). */
export function scheduleWidgetPageVisit(params: {
  widgetId: string;
  userId: string;
  pagePath: unknown;
  screenContext?: unknown;
}): void {
  if (!params.widgetId || !params.userId || !params.pagePath) return;
  const run = () => recordWidgetPageVisit(params);
  try {
    after(run);
  } catch {
    void run(); // fuera de un request de Next.js (tests, scripts)
  }
}

const cache = new Map<string, { at: number; map: AppMapEntry[]; screen: boolean }>();
const CACHE_TTL_MS = 60_000;

export async function getWidgetAppMap(widgetId: string): Promise<AppMapEntry[]> {
  if (!widgetId) return [];
  const hit = cache.get(widgetId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.map;
  try {
    const w = (await Widget.findById(widgetId).select('+appMap screenContextEnabled').lean()) as {
      appMap?: unknown;
      screenContextEnabled?: boolean;
    } | null;
    const screen = w?.screenContextEnabled === true;
    let map = normalizeAppMap(w?.appMap ?? []).map;
    if (screen) map = withLearnedSections(map, await readLearnedScreens(widgetId));
    cache.set(widgetId, { at: Date.now(), map, screen });
    return map;
  } catch (err) {
    console.warn('[widget-app-map] read skipped:', err);
    return hit?.map ?? [];
  }
}

/** Secciones aprendidas por ruta (fallo = sin aprendido: el mapa del dueño sigue igual). */
async function readLearnedScreens(widgetId: string): Promise<LearnedScreenRow[]> {
  try {
    const rows = (await WidgetPageVisit.find({ widgetId, sections: { $exists: true } })
      .sort({ visits: -1 })
      .limit(MAX_DISCOVERED_PATHS)
      .select({ _id: 0, path: 1, visits: 1, sections: 1 })
      .lean()) as Array<{ path: string; visits?: number; sections?: Record<string, string> }>;
    return rows.map((r) => ({ path: r.path, visits: r.visits ?? 0, sections: r.sections ?? {} }));
  } catch (err) {
    console.warn('[widget-app-map] learned read skipped:', err);
    return [];
  }
}

/** "Leer la pantalla" del widget (misma lectura y caché que el mapa: sin consulta extra). */
export async function getWidgetScreenContextEnabled(widgetId: string): Promise<boolean> {
  if (!widgetId) return false;
  const hit = cache.get(widgetId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.screen;
  await getWidgetAppMap(widgetId);
  return cache.get(widgetId)?.screen === true;
}

/** Tras guardar en el panel: que esta instancia no sirva el mapa viejo. */
export function forgetWidgetAppMap(widgetId: string): void {
  cache.delete(widgetId);
}

/** Solo tests. */
export function __resetAppMapCacheForTests(): void {
  cache.clear();
}
