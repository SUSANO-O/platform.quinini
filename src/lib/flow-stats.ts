import { FlowConversation } from '@/lib/db/models';
import type { FlowStats } from '@/lib/flow-admin';
import type { FlowConversationItem } from '@/lib/flow-editor/types';

export type { FlowConversationItem };

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function aggregateFlowStats(flowId: string, userId: string): Promise<FlowStats> {
  const [totals] = await FlowConversation.aggregate<{
    total: number;
    completed: number;
    abandoned: number;
    active: number;
    totalMessages: number;
    avgDuration: number | null;
  }>([
    { $match: { flowId, userId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        abandoned: { $sum: { $cond: [{ $eq: ['$status', 'abandoned'] }, 1, 0] } },
        active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        totalMessages: { $sum: '$messageCount' },
        avgDuration: { $avg: '$durationSec' },
      },
    },
  ]);

  const totalConversations = totals?.total ?? 0;
  const completed = totals?.completed ?? 0;
  const abandoned = totals?.abandoned ?? 0;
  const totalMessages = totals?.totalMessages ?? 0;
  const finished = completed + abandoned;
  const completionRate = finished > 0 ? Math.round((completed / finished) * 100) : 0;
  const avgDurationSec = totals?.avgDuration != null ? Math.round(totals.avgDuration) : 0;
  const avgMessagesPerConversation = totalConversations > 0
    ? Math.round((totalMessages / totalConversations) * 10) / 10
    : 0;

  return {
    totalConversations,
    completed,
    abandoned,
    completionRate,
    avgDurationSec,
    totalMessages,
    avgMessagesPerConversation,
  };
}

export async function listRecentFlowConversations(
  flowId: string,
  userId: string,
  limit = 10,
): Promise<FlowConversationItem[]> {
  const rows = await FlowConversation.find({ flowId, userId })
    .sort({ startedAt: -1 })
    .limit(limit)
    .select({
      sessionId: 1,
      status: 1,
      startedAt: 1,
      endedAt: 1,
      durationSec: 1,
      messageCount: 1,
      visitorId: 1,
      lead: 1,
      source: 1,
      handedOffTo: 1,
    })
    .lean();

  return rows.map((r) => ({
    sessionId: r.sessionId,
    status: r.status as FlowConversationItem['status'],
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    durationSec: r.durationSec ?? null,
    messageCount: r.messageCount ?? 0,
    visitorId: r.visitorId ?? '',
    lead: r.lead
      ? { name: r.lead.name, email: r.lead.email, phone: r.lead.phone }
      : null,
    sourcePath: typeof r.source?.pagePath === 'string' ? r.source.pagePath : '',
    handedOff: Boolean(r.handedOffTo),
  }));
}

export async function upsertFlowConversation(opts: {
  flowId: string;
  userId: string;
  sessionId: string;
  widgetId?: string;
  visitorId?: string;
  status?: 'active' | 'completed' | 'abandoned';
  messageCount?: number;
  currentNodeId?: string;
  answers?: unknown[];
  source?: unknown;
  handedOffTo?: string;
}): Promise<void> {
  const now = new Date();
  const status = opts.status ?? 'active';
  const ending = status === 'completed' || status === 'abandoned';

  // Acotado al flujo: el sessionId lo manda el navegador; no debe poder pisar la sesión de otro flujo.
  const existing = await FlowConversation.findOne({ sessionId: opts.sessionId, flowId: opts.flowId }).lean();
  if (!existing) {
    await FlowConversation.create({
      flowId: opts.flowId,
      userId: opts.userId,
      sessionId: opts.sessionId,
      widgetId: opts.widgetId ?? '',
      visitorId: opts.visitorId ?? '',
      status,
      startedAt: now,
      endedAt: ending ? now : null,
      durationSec: ending ? 0 : null,
      messageCount: opts.messageCount ?? 0,
      currentNodeId: opts.currentNodeId ?? '',
      answers: opts.answers ?? [],
      month: monthKey(now),
      ...(opts.source ? { source: opts.source } : {}),
      ...(opts.handedOffTo ? { handedOffTo: opts.handedOffTo } : {}),
    });
    return;
  }

  // Los registros del navegador pueden llegar en desorden (el último paso y el "completado" salen
  // casi a la vez): una conversación terminada no vuelve a "active".
  const effectiveStatus =
    status === 'active' && (existing.status === 'completed' || existing.status === 'abandoned')
      ? (existing.status as 'completed' | 'abandoned')
      : status;
  const stillEnding = effectiveStatus === 'completed' || effectiveStatus === 'abandoned';
  const startedAt = existing.startedAt ?? now;
  const endedAt = stillEnding ? (existing.endedAt ?? now) : null;
  const durationSec = endedAt
    ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
    : null;

  await FlowConversation.updateOne(
    { sessionId: opts.sessionId, flowId: opts.flowId },
    {
      $set: {
        status: effectiveStatus,
        endedAt,
        durationSec,
        messageCount: opts.messageCount ?? existing.messageCount ?? 0,
        currentNodeId: opts.currentNodeId ?? existing.currentNodeId ?? '',
        ...(opts.answers ? { answers: opts.answers } : {}),
        ...(opts.widgetId ? { widgetId: opts.widgetId } : {}),
        ...(opts.visitorId ? { visitorId: opts.visitorId } : {}),
        ...(opts.source && !existing.source ? { source: opts.source } : {}),
        ...(opts.handedOffTo ? { handedOffTo: opts.handedOffTo } : {}),
      },
    },
  );
}

/**
 * Guarda el lead una sola vez por sesión. true = esta llamada lo capturó (y debe avisar por
 * webhook); false = ya estaba capturado (reintento del navegador, doble clic…).
 */
export async function captureFlowLeadOnce(opts: {
  flowId: string;
  sessionId: string;
  lead: unknown;
}): Promise<boolean> {
  const r = await FlowConversation.updateOne(
    { sessionId: opts.sessionId, flowId: opts.flowId, leadCapturedAt: null },
    { $set: { lead: opts.lead, leadCapturedAt: new Date() } },
  );
  return r.modifiedCount === 1;
}

export { monthKey as flowConversationMonthKey };
