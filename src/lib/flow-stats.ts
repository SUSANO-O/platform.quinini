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
  visited?: string[];
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
      ...(opts.visited?.length ? { visited: opts.visited } : {}),
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
        ...(opts.visited?.length ? { visited: opts.visited } : {}),
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

// ── Embudo por paso ─────────────────────────────────────────────────────────

export type FlowFunnelStep = {
  nodeId: string;
  type: string;
  label: string;
  /** Conversaciones que llegaron a este paso. */
  reached: number;
  /** Conversaciones que se quedaron aquí sin completar el flujo. */
  dropped: number;
  /** dropped / reached, en %. */
  dropRate: number;
};

/** Nodos que el visitante no "ve" como paso (no tienen sentido en el embudo). */
const FUNNEL_SKIP = new Set(['start', 'condition', 'set_variable', 'goto', 'random', 'delay']);

type FunnelNode = { id?: unknown; type?: unknown; question?: unknown };
type FunnelEdge = { fromNodeId?: unknown; toNodeId?: unknown };

/** Pasos en el orden del recorrido desde el inicio (BFS), con llegadas y abandonos. */
export function buildFlowFunnel(
  nodes: FunnelNode[],
  connections: FunnelEdge[],
  reached: Map<string, number>,
  dropped: Map<string, number>,
): FlowFunnelStep[] {
  const byId = new Map(nodes.filter((n) => typeof n?.id === 'string').map((n) => [n.id as string, n]));
  const out = new Map<string, string[]>();
  for (const c of connections) {
    if (typeof c?.fromNodeId !== 'string' || typeof c?.toNodeId !== 'string') continue;
    out.set(c.fromNodeId, [...(out.get(c.fromNodeId) ?? []), c.toNodeId]);
  }
  const order: string[] = [];
  const seen = new Set<string>(['start']);
  const queue = ['start'];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of out.get(id) ?? []) {
      if (seen.has(next) || !byId.has(next)) continue;
      seen.add(next);
      order.push(next);
      queue.push(next);
    }
  }
  return order
    .map((id) => byId.get(id)!)
    .filter((n) => !FUNNEL_SKIP.has(String(n.type)))
    .map((n) => {
      const id = n.id as string;
      const r = reached.get(id) ?? 0;
      const d = dropped.get(id) ?? 0;
      return {
        nodeId: id,
        type: String(n.type),
        label: (typeof n.question === 'string' && n.question.trim() ? n.question.trim() : String(n.type)).slice(0, 80),
        reached: r,
        dropped: d,
        dropRate: r > 0 ? Math.round((d / r) * 100) : 0,
      };
    });
}

/** Una conversación "activa" sin movimiento en este tiempo cuenta como abandonada en el embudo. */
const FUNNEL_IDLE_MS = 30 * 60_000;

export async function aggregateFlowFunnel(
  flowId: string,
  userId: string,
  nodes: FunnelNode[],
  connections: FunnelEdge[],
): Promise<FlowFunnelStep[]> {
  const cutoff = new Date(Date.now() - FUNNEL_IDLE_MS);
  const [res] = await FlowConversation.aggregate<{
    reached: Array<{ _id: string; n: number }>;
    dropped: Array<{ _id: string; n: number }>;
  }>([
    { $match: { flowId, userId } },
    {
      $project: {
        status: 1,
        currentNodeId: 1,
        updatedAt: 1,
        handedOffTo: 1,
        visited: {
          $setUnion: [
            { $map: { input: { $ifNull: ['$answers', []] }, as: 'a', in: '$$a.nodeId' } },
            { $ifNull: ['$visited', []] },
            [{ $ifNull: ['$currentNodeId', ''] }],
          ],
        },
      },
    },
    {
      $facet: {
        reached: [{ $unwind: '$visited' }, { $group: { _id: '$visited', n: { $sum: 1 } } }],
        dropped: [
          {
            $match: {
              status: { $ne: 'completed' },
              handedOffTo: { $in: [null, ''] },
              $or: [{ status: 'abandoned' }, { updatedAt: { $lt: cutoff } }],
            },
          },
          { $group: { _id: '$currentNodeId', n: { $sum: 1 } } },
        ],
      },
    },
  ]);
  const toMap = (rows: Array<{ _id: string; n: number }> | undefined) =>
    new Map((rows ?? []).filter((r) => r._id).map((r) => [r._id, r.n]));
  return buildFlowFunnel(nodes, connections, toMap(res?.reached), toMap(res?.dropped));
}

export { monthKey as flowConversationMonthKey };
