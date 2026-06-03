/**
 * GET /api/admin/inference-metrics?from=ISO&to=ISO&userId=...&agentId=...&path=...
 *
 * Solo admin. Agrega métricas de InferenceMetric para alimentar el dashboard
 * /admin/inference-metrics (gráficos de tokens, costo, latencia, tools).
 *
 * Devuelve:
 *   summary       — totales del rango
 *   byDay         — serie temporal (timeline)
 *   byPath        — desglose por path (direct-mcp, stream-proxy, etc.)
 *   byAgent       — top 10 agentes por uso
 *   topTools      — top tools invocados
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { InferenceMetric, User } from '@/lib/db/models';

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
  const filterUserId = url.searchParams.get('userId')?.trim() || '';
  const filterAgentId = url.searchParams.get('agentId')?.trim() || '';
  const filterPath = url.searchParams.get('path')?.trim() || '';

  // Default: últimos 30 días
  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 30 * 86_400_000);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'from/to inválidos.' }, { status: 400 });
  }

  const baseMatch: Record<string, unknown> = { createdAt: { $gte: from, $lte: to } };
  if (filterUserId) baseMatch.userId = filterUserId;
  if (filterAgentId) baseMatch.agentId = filterAgentId;
  if (filterPath) baseMatch.path = filterPath;

  const [summary, byDay, byPath, byAgentRaw, topToolsRaw] = await Promise.all([
    // $percentile (MongoDB 7+) no está en los tipos de Mongoose — usamos pipeline as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    InferenceMetric.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          requests: { $sum: 1 },
          okRequests: { $sum: { $cond: [{ $eq: ['$ok', true] }, 1, 0] } },
          inputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
          outputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
          totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
          avgLatencyMs: { $avg: '$latencyMs' },
          p95LatencyMs: { $percentile: { input: '$latencyMs', p: [0.95], method: 'approximate' } },
          costUsd: { $sum: { $ifNull: ['$costUsd', 0] } },
          totalToolRounds: { $sum: '$toolRounds' },
        },
      },
    ] as any),
    // Serie por día (TZ Colombia UTC-5: agrupamos por fecha shiftada)
    InferenceMetric.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: { $subtract: ['$createdAt', 5 * 60 * 60 * 1000] }, // shift a Colombia
              timezone: 'UTC',
            },
          },
          requests: { $sum: 1 },
          inputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
          outputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
          costUsd: { $sum: { $ifNull: ['$costUsd', 0] } },
          avgLatencyMs: { $avg: '$latencyMs' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    InferenceMetric.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$path',
          requests: { $sum: 1 },
          inputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
          outputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
          avgLatencyMs: { $avg: '$latencyMs' },
        },
      },
      { $sort: { requests: -1 } },
    ]),
    InferenceMetric.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$agentId',
          requests: { $sum: 1 },
          inputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
          outputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
          totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
        },
      },
      { $sort: { requests: -1 } },
      { $limit: 10 },
    ]),
    InferenceMetric.aggregate([
      { $match: baseMatch },
      { $unwind: '$toolsUsed' },
      { $group: { _id: '$toolsUsed', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
  ]);

  const s = summary[0] || {};
  return NextResponse.json({
    period: { from: from.toISOString(), to: to.toISOString(), timezone: 'America/Bogota' },
    filters: { userId: filterUserId || null, agentId: filterAgentId || null, path: filterPath || null },
    summary: {
      requests:        s.requests ?? 0,
      okRequests:      s.okRequests ?? 0,
      errorRate:       s.requests > 0 ? Math.round(((s.requests - s.okRequests) / s.requests) * 1000) / 10 : 0,
      inputTokens:     s.inputTokens ?? 0,
      outputTokens:    s.outputTokens ?? 0,
      totalTokens:     s.totalTokens || (s.inputTokens ?? 0) + (s.outputTokens ?? 0),
      avgLatencyMs:    s.avgLatencyMs ? Math.round(s.avgLatencyMs) : 0,
      p95LatencyMs:    Array.isArray(s.p95LatencyMs) && s.p95LatencyMs.length ? Math.round(s.p95LatencyMs[0]) : 0,
      costUsd:         s.costUsd ?? 0,
      totalToolRounds: s.totalToolRounds ?? 0,
    },
    byDay:    byDay.map(d => ({ date: d._id, requests: d.requests, inputTokens: d.inputTokens, outputTokens: d.outputTokens, costUsd: d.costUsd, avgLatencyMs: Math.round(d.avgLatencyMs || 0) })),
    byPath:   byPath.map(p => ({ path: p._id || '(unknown)', requests: p.requests, inputTokens: p.inputTokens, outputTokens: p.outputTokens, avgLatencyMs: Math.round(p.avgLatencyMs || 0) })),
    byAgent:  byAgentRaw.map(a => ({ agentId: a._id || '(unknown)', requests: a.requests, inputTokens: a.inputTokens, outputTokens: a.outputTokens, totalTokens: a.totalTokens })),
    topTools: topToolsRaw.map(t => ({ toolId: t._id || '(unknown)', count: t.count })),
  });
}
