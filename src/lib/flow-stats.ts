import { FlowConversation } from '@/lib/db/models';
import type { FlowStats } from '@/lib/flow-admin';

export type FlowConversationItem = {
  sessionId: string;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  messageCount: number;
  visitorId: string;
};

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
}): Promise<void> {
  const now = new Date();
  const status = opts.status ?? 'active';
  const ending = status === 'completed' || status === 'abandoned';

  const existing = await FlowConversation.findOne({ sessionId: opts.sessionId }).lean();
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
    });
    return;
  }

  const startedAt = existing.startedAt ?? now;
  const endedAt = ending ? (existing.endedAt ?? now) : null;
  const durationSec = endedAt
    ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
    : null;

  await FlowConversation.updateOne(
    { sessionId: opts.sessionId },
    {
      $set: {
        status,
        endedAt,
        durationSec,
        messageCount: opts.messageCount ?? existing.messageCount ?? 0,
        currentNodeId: opts.currentNodeId ?? existing.currentNodeId ?? '',
        ...(opts.answers ? { answers: opts.answers } : {}),
        ...(opts.widgetId ? { widgetId: opts.widgetId } : {}),
        ...(opts.visitorId ? { visitorId: opts.visitorId } : {}),
      },
    },
  );
}

export { monthKey as flowConversationMonthKey };
