/**
 * Resolución de agentes de plataforma y conteo de uso gratuito (widget).
 */

import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Widget, RequestLog, PlatformUsage } from '@/lib/db/models';
import { PLATFORM_AGENT_FREE_REQUESTS_PER_USER_MONTH } from '@/lib/agent-plans';

/** Resuelve un ClientAgent por id Mongo, agentHubId o slug del hub. */
export async function findClientAgentBySentId(sentAgentId: string) {
  const sent = sentAgentId.trim();
  if (!sent) return null;
  if (/^[a-f0-9]{24}$/i.test(sent)) {
    const a = await ClientAgent.findById(sent).select({ isPlatform: 1 }).lean();
    if (a) return a;
  }
  const byHub = await ClientAgent.findOne({ agentHubId: sent }).select({ isPlatform: 1 }).lean();
  if (byHub) return byHub;
  return null;
}

/**
 * Tras un chat de widget exitoso: si el agente es de plataforma y el usuario aún no
 * superó el umbral mensual gratis, solo incrementa PlatformUsage; si no, RequestLog.
 */
export async function trackWidgetChatUsage(
  widgetToken: string,
  parsedAgentId: string,
  ok: boolean,
): Promise<void> {
  if (!ok || !widgetToken.startsWith('wt_') || !parsedAgentId.trim()) return;

  await connectDB();

  const w = await Widget.findOne({ afhubToken: widgetToken.trim() })
    .select({ _id: 1, userId: 1 })
    .lean() as { _id: { toString(): string }; userId: string } | null;
  if (!w) return;

  const month = new Date().toISOString().slice(0, 7);
  const agent = await findClientAgentBySentId(parsedAgentId);
  const isPlatform = agent?.isPlatform === true;

  if (isPlatform) {
    const row = await PlatformUsage.findOne({ userId: w.userId, month }).lean() as
      | { platformFreeUsed?: number }
      | null;
    const used = row?.platformFreeUsed ?? 0;
    if (used < PLATFORM_AGENT_FREE_REQUESTS_PER_USER_MONTH) {
      await PlatformUsage.updateOne(
        { userId: w.userId, month },
        { $inc: { platformFreeUsed: 1 } },
        { upsert: true },
      );
      return;
    }
  }

  await RequestLog.updateOne(
    { userId: w.userId, widgetId: w._id.toString(), month },
    { $inc: { count: 1 } },
    { upsert: true },
  );
}
