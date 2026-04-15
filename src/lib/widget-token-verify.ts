/**
 * Validación de widgets (tokens wt_*) para /api/widget/chat y rutas internas.
 */
import mongoose from 'mongoose';
import { Widget, ClientAgent } from '@/lib/db/models';

function normalizeAgentField(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && v instanceof mongoose.Types.ObjectId) return v.toString();
  return String(v).trim();
}

/**
 * Carga el widget por token y opcionalmente por _id (más fiable que solo afhubToken).
 */
export async function findWidgetForWtToken(
  token: string,
  widgetId?: string,
): Promise<{ agentId: unknown; userId: string } | null> {
  const t = token.trim();
  if (!t.startsWith('wt_')) return null;

  if (widgetId && mongoose.Types.ObjectId.isValid(widgetId)) {
    const w = await Widget.findById(widgetId).select({ agentId: 1, userId: 1, afhubToken: 1 }).lean();
    if (w) {
      const stored = w.afhubToken != null ? String(w.afhubToken).trim() : '';
      if (stored && stored !== t) return null;
      return { agentId: w.agentId, userId: String(w.userId) };
    }
    // widgetId inválido o doc borrado: intentar solo por token
  }

  const w = await Widget.findOne({ afhubToken: t }).select({ agentId: 1, userId: 1 }).lean();
  return w ? { agentId: w.agentId, userId: String(w.userId) } : null;
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
