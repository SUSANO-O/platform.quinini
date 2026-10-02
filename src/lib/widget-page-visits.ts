/**
 * Persistencia del mapa de la app y del autodescubrimiento (ver `widget-app-map.ts`).
 *
 * - `recordWidgetPageVisit`: best-effort, nunca lanza. Topes: 500 rutas por widget y 60 pestañas /
 *   40 nombres de parámetro por ruta (el token del widget es público: alguien podría inflarlo).
 * - `getWidgetAppMap`: lectura con caché en memoria de 60 s (un cambio en el panel tarda ≤ 1 min).
 */

import { after } from 'next/server';
import { Widget, WidgetPageVisit } from '@/lib/db/models';
import { normalizeAppMap, pageVisitFromPagePath, type AppMapEntry } from '@/lib/widget-app-map';

export const MAX_DISCOVERED_PATHS = 500;
const MAX_HASHES = 60;
const MAX_PARAM_KEYS = 40;

export async function recordWidgetPageVisit(params: {
  widgetId: string;
  userId: string;
  pagePath: unknown;
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
export function scheduleWidgetPageVisit(params: { widgetId: string; userId: string; pagePath: unknown }): void {
  if (!params.widgetId || !params.userId || !params.pagePath) return;
  const run = () => recordWidgetPageVisit(params);
  try {
    after(run);
  } catch {
    void run(); // fuera de un request de Next.js (tests, scripts)
  }
}

const cache = new Map<string, { at: number; map: AppMapEntry[] }>();
const CACHE_TTL_MS = 60_000;

export async function getWidgetAppMap(widgetId: string): Promise<AppMapEntry[]> {
  if (!widgetId) return [];
  const hit = cache.get(widgetId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.map;
  try {
    const w = (await Widget.findById(widgetId).select('+appMap').lean()) as { appMap?: unknown } | null;
    const map = normalizeAppMap(w?.appMap ?? []).map;
    cache.set(widgetId, { at: Date.now(), map });
    return map;
  } catch (err) {
    console.warn('[widget-app-map] read skipped:', err);
    return hit?.map ?? [];
  }
}

/** Tras guardar en el panel: que esta instancia no sirva el mapa viejo. */
export function forgetWidgetAppMap(widgetId: string): void {
  cache.delete(widgetId);
}

/** Solo tests. */
export function __resetAppMapCacheForTests(): void {
  cache.clear();
}
