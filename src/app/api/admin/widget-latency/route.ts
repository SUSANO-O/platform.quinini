/**
 * GET /api/admin/widget-latency?from=ISO&to=ISO&agentId=...
 *
 * Agrega métricas de latencia por fase del widget (Fase 4).
 * Incluye alerta si p95 > 15s.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User, WidgetChatLatency } from '@/lib/db/models';
import { analyzeWidgetLatencyInsights } from '@/lib/widget-latency-insights';

const SLOW_P95_MS = 15_000;

function auth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();

  const me = await User.findById(userId).select({ role: 1 }).lean() as { role?: string } | null;
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Solo admin.' }, { status: 403 });

  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const filterAgentId = url.searchParams.get('agentId')?.trim() || '';
  const filterPath = url.searchParams.get('path')?.trim() || '';

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 7 * 86_400_000);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'from/to inválidos.' }, { status: 400 });
  }

  const baseMatch: Record<string, unknown> = { createdAt: { $gte: from, $lte: to } };
  if (filterAgentId) baseMatch.agentId = filterAgentId;
  if (filterPath) baseMatch.path = filterPath;

  const [summary, byPath, byDay, byPhase, byAgent, slowSamples] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    WidgetChatLatency.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          requests: { $sum: 1 },
          okRequests: { $sum: { $cond: [{ $eq: ['$ok', true] }, 1, 0] } },
          avgTotalMs: { $avg: '$totalMs' },
          p95TotalMs: { $percentile: { input: '$totalMs', p: [0.95], method: 'approximate' } },
        },
      },
    ] as any),
    WidgetChatLatency.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$path',
          requests: { $sum: 1 },
          avgTotalMs: { $avg: '$totalMs' },
        },
      },
      { $sort: { requests: -1 } },
    ]),
    WidgetChatLatency.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: { $subtract: ['$createdAt', 5 * 60 * 60 * 1000] },
              timezone: 'UTC',
            },
          },
          requests: { $sum: 1 },
          avgTotalMs: { $avg: '$totalMs' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    WidgetChatLatency.aggregate([
      { $match: baseMatch },
      { $project: { phases: { $objectToArray: { $ifNull: ['$phases', {}] } } } },
      { $unwind: '$phases' },
      {
        $group: {
          _id: '$phases.k',
          avgMs: { $avg: '$phases.v' },
          samples: { $sum: 1 },
        },
      },
      { $sort: { avgMs: -1 } },
      { $limit: 12 },
    ]),
    WidgetChatLatency.aggregate([
      { $match: { ...baseMatch, agentId: { $nin: ['', null] } } },
      {
        $group: {
          _id: '$agentId',
          requests: { $sum: 1 },
          avgTotalMs: { $avg: '$totalMs' },
          topPath: { $first: '$path' },
        },
      },
      { $sort: { avgTotalMs: -1 } },
      { $limit: 8 },
    ]),
    WidgetChatLatency.find({ ...baseMatch, totalMs: { $gte: SLOW_P95_MS } })
      .sort({ createdAt: -1 })
      .limit(10)
      .select({ traceId: 1, totalMs: 1, path: 1, phases: 1, agentId: 1, createdAt: 1 })
      .lean(),
  ]);

  const s = summary[0] || {};
  const p95 = Array.isArray(s.p95TotalMs) && s.p95TotalMs.length ? Math.round(s.p95TotalMs[0]) : 0;
  const totalRequests = s.requests ?? 0;
  const avgTotalMs = s.avgTotalMs ? Math.round(s.avgTotalMs) : 0;

  const byPathRows = byPath.map((p: { _id?: string; requests?: number; avgTotalMs?: number }) => ({
    path: p._id || '(unknown)',
    requests: p.requests ?? 0,
    avgTotalMs: Math.round(p.avgTotalMs || 0),
  }));

  const byPhaseRows = byPhase.map((p: { _id?: string; avgMs?: number; samples?: number }) => ({
    phase: p._id || '(unknown)',
    avgMs: Math.round(p.avgMs || 0),
    samples: p.samples ?? 0,
  }));

  const insights = analyzeWidgetLatencyInsights({
    totalRequests,
    avgTotalMs,
    byPath: byPathRows,
    byPhase: byPhaseRows,
  });

  return NextResponse.json({
    period: { from: from.toISOString(), to: to.toISOString(), timezone: 'America/Bogota' },
    filters: { agentId: filterAgentId || null, path: filterPath || null },
    alert: {
      slowP95ThresholdMs: SLOW_P95_MS,
      p95Exceeded: p95 >= SLOW_P95_MS,
      message:
        p95 >= SLOW_P95_MS
          ? `p95 de latencia (${p95}ms) supera el umbral de ${SLOW_P95_MS}ms`
          : null,
    },
    summary: {
      requests: totalRequests,
      okRequests: s.okRequests ?? 0,
      errorRate:
        totalRequests > 0 ? Math.round(((totalRequests - (s.okRequests ?? 0)) / totalRequests) * 1000) / 10 : 0,
      avgTotalMs,
      p95TotalMs: p95,
    },
    insights,
    byPath: byPathRows,
    byDay: byDay.map((d: { _id?: string; requests?: number; avgTotalMs?: number }) => ({
      date: d._id,
      requests: d.requests ?? 0,
      avgTotalMs: Math.round(d.avgTotalMs || 0),
    })),
    byPhase: byPhaseRows,
    byAgent: byAgent.map((a: { _id?: string; requests?: number; avgTotalMs?: number; topPath?: string }) => ({
      agentId: a._id || '(unknown)',
      requests: a.requests ?? 0,
      avgTotalMs: Math.round(a.avgTotalMs || 0),
      topPath: a.topPath || '',
    })),
    slowSamples,
  });
}
