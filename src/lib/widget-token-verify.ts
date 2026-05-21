/**
 * Validación de widgets (tokens wt_*) para /api/widget/chat y rutas internas.
 */
import mongoose from 'mongoose';
import { Widget, ClientAgent } from '@/lib/db/models';
import { redis } from '@/lib/redis';

const WT_CACHE_TTL = 300; // 5 minutos

function normalizeMultiAgentMode(v: unknown): 'triage' | 'parallel' {
  return v === 'parallel' ? 'parallel' : 'triage';
}

function normalizeAgentField(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && v instanceof mongoose.Types.ObjectId) return v.toString();
  return String(v).trim();
}

export type WidgetInfo = {
  agentId: unknown;
  userId: string;
  allowedOrigins: string[];
  multiAgentEnabled?: boolean;
  multiAgentMode?: 'triage' | 'parallel';
  agentIds?: string[];
};

/**
 * Carga el widget por token y opcionalmente por _id (más fiable que solo afhubToken).
 * Devuelve también allowedOrigins para validación de dominio en el handler.
 */
export async function findWidgetForWtToken(
  token: string,
  widgetId?: string,
): Promise<WidgetInfo | null> {
  const t = token.trim();
  if (!t.startsWith('wt_')) return null;

  const cacheKey = `wt:${widgetId ?? t}`;
  try {
    const cached = await redis.get<WidgetInfo>(cacheKey);
    if (cached) return cached;
  } catch { /* redis no bloquea si falla */ }

  let result: WidgetInfo | null = null;

  if (widgetId && mongoose.Types.ObjectId.isValid(widgetId)) {
    const w = await Widget.findById(widgetId)
      .select({
        agentId: 1,
        userId: 1,
        afhubToken: 1,
        allowedOrigins: 1,
        multiAgentEnabled: 1,
        multiAgentMode: 1,
        agentIds: 1,
      })
      .lean() as {
        agentId: unknown;
        userId: unknown;
        afhubToken?: unknown;
        allowedOrigins?: string[];
        multiAgentEnabled?: boolean;
        multiAgentMode?: string;
        agentIds?: string[];
      } | null;
    if (w) {
      const stored = w.afhubToken != null ? String(w.afhubToken).trim() : '';
      if (stored && stored !== t) return null;
      result = {
        agentId: w.agentId,
        userId: String(w.userId),
        allowedOrigins: Array.isArray(w.allowedOrigins) ? w.allowedOrigins : [],
        multiAgentEnabled: w.multiAgentEnabled === true,
        multiAgentMode: normalizeMultiAgentMode(w.multiAgentMode),
        agentIds: Array.isArray(w.agentIds) ? w.agentIds.map(String) : [],
      };
    }
  }

  if (!result) {
    const w = await Widget.findOne({ afhubToken: t })
      .select({
        agentId: 1,
        userId: 1,
        allowedOrigins: 1,
        multiAgentEnabled: 1,
        multiAgentMode: 1,
        agentIds: 1,
      })
      .lean() as {
        agentId: unknown;
        userId: unknown;
        allowedOrigins?: string[];
        multiAgentEnabled?: boolean;
        multiAgentMode?: string;
        agentIds?: string[];
      } | null;
    if (w) {
      result = {
        agentId: w.agentId,
        userId: String(w.userId),
        allowedOrigins: Array.isArray(w.allowedOrigins) ? w.allowedOrigins : [],
        multiAgentEnabled: w.multiAgentEnabled === true,
        multiAgentMode: normalizeMultiAgentMode(w.multiAgentMode),
        agentIds: Array.isArray(w.agentIds) ? w.agentIds.map(String) : [],
      };
    }
  }

  if (result) {
    try { await redis.set(cacheKey, result, { ex: WT_CACHE_TTL }); } catch { /* no fatal */ }
  }

  return result;
}

/** Invalida caché wt_* tras guardar un widget (multi-agente, agentId, etc.). */
export async function invalidateWidgetTokenCache(token: string, widgetId?: string): Promise<void> {
  const t = token.trim();
  if (!t.startsWith('wt_')) return;
  try {
    await redis.del(`wt:${widgetId ?? t}`);
    if (widgetId) await redis.del(`wt:${t}`);
  } catch {
    /* no fatal */
  }
}

/**
 * El SDK envía el id del catálogo (slug); en Mongo puede estar el slug o el _id del ClientAgent (hex 24).
 */
export async function sentAgentIdMatchesWidget(
  sentAgentId: string,
  widgetAgentRaw: unknown,
): Promise<boolean> {
  const sent = sentAgentId.trim();
  const w = normalizeAgentField(widgetAgentRaw);
  if (!sent || !w) return false;
  if (w === sent || w.toLowerCase() === sent.toLowerCase()) return true;

  // Widget guarda slug del hub y el SDK envía ObjectId del ClientAgent (p. ej. plataforma).
  if (/^[a-f0-9]{24}$/i.test(sent)) {
    const bySent = await ClientAgent.findById(sent).select({ agentHubId: 1 }).lean();
    const hubFromDoc = bySent?.agentHubId ? String(bySent.agentHubId).trim() : '';
    if (
      hubFromDoc &&
      (hubFromDoc === w || hubFromDoc.toLowerCase() === w.toLowerCase())
    ) {
      return true;
    }
  }

  if (/^[a-f0-9]{24}$/i.test(w)) {
    const ca = await ClientAgent.findById(w).select({ agentHubId: 1 }).lean();
    const hub = ca?.agentHubId ? String(ca.agentHubId).trim() : '';
    if (
      hub &&
      (hub === sent || hub.toLowerCase() === sent.toLowerCase())
    ) {
      return true;
    }
  }
  return false;
}
