/**
 * Enlaza el asistente interno (Math / Math-ais) con un widget real en Mongo
 * para token wt_*, subida de capturas y handoff.
 */

import { Types } from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { Widget } from '@/lib/db/models';
import type { InternalAssistBootConfig, InternalAssistContext } from '@/lib/internal-assist-config';

function widgetIdEnvKey(context: InternalAssistContext): string {
  return context === 'marketing'
    ? 'INTERNAL_MARKETING_ASSIST_WIDGET_ID'
    : 'INTERNAL_APP_ASSIST_WIDGET_ID';
}

export async function enrichInternalAssistWithWidget(
  context: InternalAssistContext,
  config: InternalAssistBootConfig,
): Promise<InternalAssistBootConfig> {
  const widgetId = process.env[widgetIdEnvKey(context)]?.trim() || '';
  if (!widgetId || !Types.ObjectId.isValid(widgetId)) return config;

  await connectDB();
  const w = (await Widget.findById(widgetId)
    .select({
      _id: 1,
      agentId: 1,
      afhubToken: 1,
      active: 1,
    })
    .lean()) as {
    _id: unknown;
    agentId?: unknown;
    afhubToken?: string | null;
    active?: boolean;
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
  };
}
