/**
 * Exportación de transcripciones de widget (mensajes reales por sesión).
 * Compartido entre GET /api/widgets/[id]/export y el paquete RGPD.
 */

import { WidgetMessage } from '@/lib/db/models';

export type WidgetConversationExport = {
  widgetId: string;
  widgetName: string;
  agentId: string;
  periodMonths: number;
  totalSessions: number;
  sessions: {
    sessionId: string;
    startedAt: Date;
    endedAt: Date;
    messageCount: number;
    messages: { role: string; content: string; at: Date }[];
  }[];
};

export async function exportWidgetConversations(
  widgetId: string,
  opts: {
    widgetName?: string;
    agentId?: string;
    months?: number;
    maxSessions?: number;
  } = {},
): Promise<WidgetConversationExport> {
  const months = Math.min(12, Math.max(1, opts.months ?? 3));
  const maxSessions = Math.min(500, Math.max(1, opts.maxSessions ?? 200));

  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const sessionAgg = (await WidgetMessage.aggregate([
    { $match: { widgetId, createdAt: { $gte: since } } },
    {
      $group: {
        _id: '$sessionId',
        firstAt: { $min: '$createdAt' },
        lastAt: { $max: '$createdAt' },
        count: { $sum: 1 },
      },
    },
    { $sort: { lastAt: -1 } },
    { $limit: maxSessions },
  ])) as { _id: string; firstAt: Date; lastAt: Date; count: number }[];

  const sessionIds = sessionAgg.map((s) => s._id);

  const messages = (await WidgetMessage.find({ widgetId, sessionId: { $in: sessionIds } })
    .select({ sessionId: 1, role: 1, content: 1, createdAt: 1 })
    .sort({ sessionId: 1, createdAt: 1 })
    .lean()) as { sessionId: string; role: string; content: string; createdAt: Date }[];

  const bySession = new Map<string, typeof messages>();
  for (const m of messages) {
    if (!bySession.has(m.sessionId)) bySession.set(m.sessionId, []);
    bySession.get(m.sessionId)!.push(m);
  }

  const sessions = sessionAgg.map((s) => ({
    sessionId: s._id,
    startedAt: s.firstAt,
    endedAt: s.lastAt,
    messageCount: s.count,
    messages: (bySession.get(s._id) ?? []).map((m) => ({
      role: m.role,
      content: m.content,
      at: m.createdAt,
    })),
  }));

  return {
    widgetId,
    widgetName: opts.widgetName ?? '',
    agentId: opts.agentId ?? '',
    periodMonths: months,
    totalSessions: sessions.length,
    sessions,
  };
}
