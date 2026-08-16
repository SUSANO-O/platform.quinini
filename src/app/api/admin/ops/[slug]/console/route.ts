/**
 * GET /api/admin/ops/:slug/console
 * Últimos turnos expandidos a líneas de consola (orquesta, fases, tools, memoria).
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { requireAdmin } from '@/lib/admin-auth';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, InferenceMetric, WidgetChatLatency, WidgetMessage } from '@/lib/db/models';
import {
  expandTurnToConsoleLines,
  isAdminOpsLiveSlug,
  type ConsoleEvent,
  type ConsoleTurnInput,
} from '@/lib/admin-ops-live';

type Params = { params: Promise<{ slug: string }> };

const LIMIT = 80;
const JOIN_MS = 20_000;

type LatencyDoc = {
  traceId?: string;
  agentId?: string;
  widgetId?: string | null;
  sessionId?: string | null;
  path?: string;
  ok?: boolean;
  errorCode?: string | null;
  totalMs?: number;
  phases?: Record<string, number>;
  replyLen?: number | null;
  createdAt?: Date;
};

type MetricDoc = {
  traceId?: string | null;
  agentId?: string;
  toolsUsed?: string[];
  historyTurns?: number;
  ragChars?: number;
  toolRounds?: number;
  model?: string;
  provider?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  systemChars?: number;
  toolDefsChars?: number;
  costUsd?: number | null;
  latencyMs?: number;
  path?: string;
  createdAt?: Date;
};

type AgentMeta = {
  name: string;
  model?: string;
  ragEnabled?: boolean;
  type?: string;
  catalogToolCount: number;
};

async function agentMeta(ids: string[]): Promise<Map<string, AgentMeta>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, AgentMeta>();
  if (!unique.length) return map;
  const objectIds = unique
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const or: Record<string, unknown>[] = [{ agentHubId: { $in: unique } }];
  if (objectIds.length) or.unshift({ _id: { $in: objectIds } });
  const agents = await ClientAgent.find({ $or: or })
    .select({ name: 1, agentHubId: 1, model: 1, ragEnabled: 1, type: 1, enabledMcpToolIds: 1, tools: 1 })
    .lean() as Array<{
      _id: unknown;
      name?: string;
      agentHubId?: string | null;
      model?: string;
      ragEnabled?: boolean;
      type?: string;
      enabledMcpToolIds?: string[];
      tools?: Array<{ toolId?: string }>;
    }>;
  for (const a of agents) {
    const name = (a.name || '').trim();
    if (!name) continue;
    const catalogToolCount = Math.max(
      Array.isArray(a.enabledMcpToolIds) ? a.enabledMcpToolIds.length : 0,
      Array.isArray(a.tools) ? a.tools.length : 0,
    );
    const meta: AgentMeta = {
      name,
      model: a.model,
      ragEnabled: a.ragEnabled,
      type: a.type,
      catalogToolCount,
    };
    map.set(String(a._id), meta);
    if (a.agentHubId) map.set(a.agentHubId, meta);
  }
  return map;
}

function pickMetric(lat: LatencyDoc, byTrace: Map<string, MetricDoc>, unused: MetricDoc[]): MetricDoc | undefined {
  const tid = String(lat.traceId || '');
  if (tid && byTrace.has(tid)) return byTrace.get(tid);
  const agentId = String(lat.agentId || '');
  const t = lat.createdAt instanceof Date ? lat.createdAt.getTime() : 0;
  if (!agentId || !t) return undefined;
  let best: MetricDoc | undefined;
  let bestDt = JOIN_MS + 1;
  for (const m of unused) {
    if (String(m.agentId || '') !== agentId) continue;
    const mt = m.createdAt instanceof Date ? m.createdAt.getTime() : 0;
    const dt = Math.abs(mt - t);
    if (dt < bestDt) {
      best = m;
      bestDt = dt;
    }
  }
  return bestDt <= JOIN_MS ? best : undefined;
}

export async function GET(req: NextRequest, { params }: Params) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { slug } = await params;
  if (!isAdminOpsLiveSlug(slug)) {
    return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
  }

  await connectDB();

  const after = req.nextUrl.searchParams.get('after')?.trim();
  const afterDate = after ? new Date(after) : null;
  const match: Record<string, unknown> = {};
  if (afterDate && !isNaN(afterDate.getTime())) {
    match.createdAt = { $gt: afterDate };
  }

  const [latencies, metrics] = await Promise.all([
    WidgetChatLatency.find(match).sort({ createdAt: -1 }).limit(LIMIT).lean() as Promise<LatencyDoc[]>,
    InferenceMetric.find(match).sort({ createdAt: -1 }).limit(LIMIT).lean() as Promise<MetricDoc[]>,
  ]);

  const byTrace = new Map<string, MetricDoc>();
  for (const m of metrics) {
    if (m.traceId && !byTrace.has(m.traceId)) byTrace.set(m.traceId, m);
  }
  const usedMetrics = new Set<MetricDoc>();

  const names = await agentMeta([
    ...latencies.map((l) => String(l.agentId || '')),
    ...metrics.map((m) => String(m.agentId || '')),
  ]);

  const sessionIds = [...new Set(latencies.map((l) => String(l.sessionId || '')).filter(Boolean))];
  const sessionCounts = new Map<string, number>();
  if (sessionIds.length) {
    const rows = await WidgetMessage.aggregate([
      { $match: { sessionId: { $in: sessionIds } } },
      { $group: { _id: '$sessionId', n: { $sum: 1 } } },
    ]) as Array<{ _id?: string; n?: number }>;
    for (const r of rows) sessionCounts.set(String(r._id || ''), r.n ?? 0);
  }

  const chronological = [...latencies].reverse();
  const events: ConsoleEvent[] = [];
  for (const lat of chronological) {
    const traceId = String(lat.traceId || '');
    if (!traceId) continue;
    const metric = pickMetric(lat, byTrace, metrics.filter((m) => !usedMetrics.has(m)));
    if (metric) usedMetrics.add(metric);
    const agentId = String(lat.agentId || metric?.agentId || '');
    const meta = names.get(agentId);
    const turn: ConsoleTurnInput = {
      traceId,
      at: (lat.createdAt instanceof Date ? lat.createdAt : new Date()).toISOString(),
      agentId,
      agentName: meta?.name || agentId.slice(0, 8),
      path: String(lat.path || ''),
      ok: lat.ok !== false,
      errorCode: lat.errorCode ?? null,
      totalMs: lat.totalMs ?? 0,
      phases: lat.phases && typeof lat.phases === 'object' ? lat.phases : {},
      toolsUsed: metric?.toolsUsed,
      historyTurns: metric?.historyTurns,
      ragChars: metric?.ragChars,
      toolRounds: metric?.toolRounds,
      model: metric?.model,
      provider: metric?.provider,
      inputTokens: metric?.inputTokens,
      outputTokens: metric?.outputTokens,
      totalTokens: metric?.totalTokens,
      systemChars: metric?.systemChars,
      toolDefsChars: metric?.toolDefsChars,
      costUsd: metric?.costUsd,
      replyLen: lat.replyLen ?? null,
      widgetId: lat.widgetId ?? null,
      sessionId: lat.sessionId ?? null,
      inferencePath: metric?.path ?? null,
      inferenceMs: metric?.latencyMs ?? null,
      ragEnabled: meta?.ragEnabled,
      agentModel: meta?.model,
      agentType: meta?.type,
      catalogToolCount: meta?.catalogToolCount,
      sessionMsgCount: sessionCounts.get(String(lat.sessionId || '')) ?? undefined,
    };
    events.push(...expandTurnToConsoleLines(turn));
  }

  const newest = latencies[0]?.createdAt;
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    cursor: newest instanceof Date ? newest.toISOString() : null,
    events,
  });
}
