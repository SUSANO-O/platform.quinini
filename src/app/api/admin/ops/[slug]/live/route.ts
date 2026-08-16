/**
 * GET /api/admin/ops/:slug/live?window=15
 * Agregado live por agente. Slug ofuscado; acceso solo sesión admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { requireAdmin } from '@/lib/admin-auth';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, WidgetChatLatency } from '@/lib/db/models';
import {
  ADMIN_OPS_LIVE_SLUG,
  DEFAULT_LIVE_WINDOW_MIN,
  MAX_LIVE_AGENTS,
  buildLiveAgentView,
  isAdminOpsLiveSlug,
  type AgentLatencyRow,
} from '@/lib/admin-ops-live';
import { COLOMBIA_OFFSET_MS } from '@/lib/colombia-time';

type Params = { params: Promise<{ slug: string }> };

const WINDOW_MIN_ALLOWED = new Set([15, 60, 1440]);

type AggRow = {
  _id?: string;
  requests?: number;
  okRequests?: number;
  avgTotalMs?: number;
  p95TotalMs?: number[] | number;
};

function p95Of(row: AggRow): number {
  const raw = row.p95TotalMs;
  if (Array.isArray(raw) && raw.length) return Number(raw[0]) || 0;
  if (typeof raw === 'number') return raw;
  return Math.round(row.avgTotalMs || 0);
}

function toRows(docs: AggRow[]): AgentLatencyRow[] {
  return docs
    .map((d) => ({
      agentId: String(d._id || ''),
      requests: d.requests ?? 0,
      okRequests: d.okRequests ?? 0,
      avgTotalMs: Math.round(d.avgTotalMs || 0),
      p95TotalMs: Math.round(p95Of(d)),
    }))
    .filter((r) => r.agentId);
}

async function aggregateWindow(from: Date, to: Date): Promise<AgentLatencyRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docs = await WidgetChatLatency.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, agentId: { $nin: ['', null] } } },
    {
      $group: {
        _id: '$agentId',
        requests: { $sum: 1 },
        okRequests: { $sum: { $cond: [{ $eq: ['$ok', true] }, 1, 0] } },
        avgTotalMs: { $avg: '$totalMs' },
        p95TotalMs: { $percentile: { input: '$totalMs', p: [0.95], method: 'approximate' } },
      },
    },
    { $sort: { requests: -1 } },
    { $limit: 80 },
  ] as any);
  return toRows(docs as AggRow[]);
}

async function attachNames(rows: AgentLatencyRow[]): Promise<AgentLatencyRow[]> {
  const ids = rows.map((r) => r.agentId);
  if (!ids.length) return rows;
  const objectIds = ids
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const or: Record<string, unknown>[] = [{ agentHubId: { $in: ids } }];
  if (objectIds.length) or.unshift({ _id: { $in: objectIds } });
  const agents = await ClientAgent.find({ $or: or })
    .select({ name: 1, agentHubId: 1 })
    .lean() as Array<{ _id: unknown; name?: string; agentHubId?: string | null }>;
  const byId = new Map<string, string>();
  for (const a of agents) {
    const name = (a.name || '').trim();
    if (!name) continue;
    byId.set(String(a._id), name);
    if (a.agentHubId) byId.set(a.agentHubId, name);
  }
  return rows.map((r) => ({ ...r, name: byId.get(r.agentId) || r.name }));
}

export async function GET(req: NextRequest, { params }: Params) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const { slug } = await params;
  if (!isAdminOpsLiveSlug(slug)) {
    return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
  }

  const url = new URL(req.url);
  const windowMinRaw = Number(url.searchParams.get('window') || DEFAULT_LIVE_WINDOW_MIN);
  const windowMin = WINDOW_MIN_ALLOWED.has(windowMinRaw) ? windowMinRaw : DEFAULT_LIVE_WINDOW_MIN;

  const to = new Date();
  const from = new Date(to.getTime() - windowMin * 60_000);
  const prevFrom = new Date(from.getTime() - windowMin * 60_000);

  await connectDB();

  const [currentRaw, previousRaw, timeline, agentTotal] = await Promise.all([
    aggregateWindow(from, to),
    aggregateWindow(prevFrom, from),
    WidgetChatLatency.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%H:%M',
              date: { $subtract: ['$createdAt', COLOMBIA_OFFSET_MS] },
              timezone: 'UTC',
            },
          },
          requests: { $sum: 1 },
          avgTotalMs: { $avg: '$totalMs' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    ClientAgent.countDocuments({}),
  ]);

  const [current, previous] = await Promise.all([
    attachNames(currentRaw),
    attachNames(previousRaw),
  ]);

  const view = buildLiveAgentView({ current, previous, maxAgents: MAX_LIVE_AGENTS });
  const requests = current.reduce((s, r) => s + r.requests, 0);
  const okRequests = current.reduce((s, r) => s + r.okRequests, 0);
  const avgMs =
    requests > 0 ? current.reduce((s, r) => s + r.avgTotalMs * r.requests, 0) / requests : 0;

  return NextResponse.json({
    slug: ADMIN_OPS_LIVE_SLUG,
    generatedAt: to.toISOString(),
    timezone: 'America/Bogota',
    windowMin,
    period: { from: from.toISOString(), to: to.toISOString() },
    previousPeriod: { from: prevFrom.toISOString(), to: from.toISOString() },
    summary: {
      agentTotal,
      agentsWithTraffic: current.length,
      requests,
      okRequests,
      errorRate: requests > 0 ? Math.round(((requests - okRequests) / requests) * 1000) / 10 : 0,
      avgSec: Math.round((avgMs / 1000) * 10) / 10,
    },
    view,
    timeline: (timeline as Array<{ _id?: string; requests?: number; avgTotalMs?: number }>).map((b) => ({
      minute: b._id || '',
      requests: b.requests ?? 0,
      avgSec: Math.round(((b.avgTotalMs || 0) / 1000) * 10) / 10,
    })),
  });
}
