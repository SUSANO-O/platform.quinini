/**
 * Enlaza el asistente interno (Math / Math-ais) con un widget real en Mongo
 * para token wt_*, subida de capturas y handoff.
 *
 * Orden: INTERNAL_*_ASSIST_WIDGET_ID → widget auto del admin (ensure-landing-assist).
 */

import { Types } from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { Widget } from '@/lib/db/models';
import type { InternalAssistBootConfig, InternalAssistContext } from '@/lib/internal-assist-config';
import { resolveInternalAssistWidgetId } from '@/lib/ensure-landing-assist-agents';

export async function enrichInternalAssistWithWidget(
  context: InternalAssistContext,
  config: InternalAssistBootConfig,
): Promise<InternalAssistBootConfig> {
  let widgetId = '';
  try {
    widgetId = (await resolveInternalAssistWidgetId(context)) || '';
  } catch {
    widgetId = '';
  }
  if (!widgetId || !Types.ObjectId.isValid(widgetId)) return config;

  await connectDB();
  const w = (await Widget.findById(widgetId)
    .select({
      _id: 1,
      agentId: 1,
      afhubToken: 1,
      active: 1,
      color: 1,
      title: 1,
      subtitle: 1,
      welcome: 1,
      fabHint: 1,
      avatar: 1,
    })
    .lean()) as {
    _id: unknown;
    agentId?: unknown;
    afhubToken?: string | null;
    active?: boolean;
    color?: string;
    title?: string;
    subtitle?: string;
    welcome?: string;
    fabHint?: string;
    avatar?: string;
  } | null;

  if (!w || w.active === false) return config;

  const token =
    typeof w.afhubToken === 'string' && w.afhubToken.trim().startsWith('wt_')
      ? w.afhubToken.trim()
      : '';
  if (!token) return config;

  const agentId =
    w.agentId != null && String(w.agentId).trim()
      ? String(w.agentId).trim()
      : config.agentId;

  return {
    ...config,
    widgetId: String(w._id),
    token,
    agentId,
    ...(typeof w.color === 'string' && w.color.trim() ? { color: w.color.trim() } : {}),
    ...(typeof w.title === 'string' && w.title.trim() ? { title: w.title.trim() } : {}),
    ...(typeof w.subtitle === 'string' && w.subtitle.trim() ? { subtitle: w.subtitle.trim() } : {}),
    ...(typeof w.welcome === 'string' && w.welcome.trim() ? { welcome: w.welcome.trim() } : {}),
    ...(typeof w.fabHint === 'string' && w.fabHint.trim() ? { fabHint: w.fabHint.trim() } : {}),
    ...(typeof w.avatar === 'string' && w.avatar.trim() ? { avatar: w.avatar.trim() } : {}),
  };
}
