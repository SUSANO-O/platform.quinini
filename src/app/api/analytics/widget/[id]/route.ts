/**
 * GET /api/analytics/widget/[id]?months=3
 *
 * Analytics enriquecido del widget. Calcula sessionId únicos, hora pico, mes,
 * etc. directamente desde `widgetmessages` (fuente real) en lugar de depender
 * de `conversationsessions` que requiere que el evento widget_opened registre
 * correctamente.
 *
 * Timezone fijo a Colombia (UTC-5) — todos los buckets de hora y mes se
 * calculan en esa zona horaria.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import {
  Widget, ConversationSession, RequestLog, WidgetFeedback, WidgetMessage,
} from '@/lib/db/models';
import {
  COLOMBIA_OFFSET_MS,
  colombiaHour,
  colombiaMonthKey,
  findPeakHour,
} from '@/lib/colombia-time';
import { isExcludedConversationSessionId } from '@/lib/conversation-metrics';

function colombiaMonth(d: Date): string {
  return colombiaMonthKey(d);
}

function auth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Últimos N meses como ['2026-06', '2026-05', '2026-04'] en TZ Colombia. */
function pastColombiaMonths(count: number): string[] {
  const months: string[] = [];
  const nowCo = new Date(Date.now() - COLOMBIA_OFFSET_MS);
  const y = nowCo.getUTCFullYear();
  const m = nowCo.getUTCMonth();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  await connectDB();

  const widget = await Widget.findOne({ _id: id, userId }).select({ name: 1 }).lean() as { name?: string } | null;
  if (!widget) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  // Si llega un rango explícito (from/to ISO), se usa. Sino, fallback a últimos 3 meses Colombia.
  let sinceUTC: Date;
  let untilUTC: Date;
  let monthKeys: string[];
  if (fromParam && toParam) {
    sinceUTC = new Date(fromParam);
    untilUTC = new Date(toParam);
    if (isNaN(sinceUTC.getTime()) || isNaN(untilUTC.getTime())) {
      return NextResponse.json({ error: 'from/to deben ser ISO 8601 válidos.' }, { status: 400 });
    }
    // Lista de meses cubiertos por el rango en TZ Colombia
    monthKeys = [];
    const cur = new Date(untilUTC.getTime() - COLOMBIA_OFFSET_MS);
    const start = new Date(sinceUTC.getTime() - COLOMBIA_OFFSET_MS);
    let y = cur.getUTCFullYear();
    let m = cur.getUTCMonth();
    while (y > start.getUTCFullYear() || (y === start.getUTCFullYear() && m >= start.getUTCMonth())) {
      monthKeys.push(`${y}-${String(m + 1).padStart(2, '0')}`);
      m--; if (m < 0) { m = 11; y--; }
    }
  } else {
    const months = Math.min(12, Math.max(1, Number(url.searchParams.get('months') || '3')));
    monthKeys = pastColombiaMonths(months);
    const oldest = monthKeys[monthKeys.length - 1] || monthKeys[0];
    const [oy, om] = oldest.split('-').map(Number);
    sinceUTC = new Date(Date.UTC(oy, (om || 1) - 1, 1) + COLOMBIA_OFFSET_MS);
    untilUTC = new Date();
  }

  // ── Sesiones únicas + hora/mes en TZ Colombia desde widgetmessages ──
  const messages = await WidgetMessage.find({
    widgetId: id,
    userId,
    createdAt: { $gte: sinceUTC, $lte: untilUTC },
  }).select({ sessionId: 1, createdAt: 1 }).lean() as Array<{
    sessionId?: string; createdAt?: Date;
  }>;

  // Agrupar por sessionId — fecha de inicio = primer mensaje
  const sessionsBySid = new Map<string, { firstAt: Date; msgCount: number }>();
  for (const m of messages) {
    const sid = typeof m.sessionId === 'string' ? m.sessionId : '';
    if (!sid || sid.startsWith('ho_')) continue;
    const at = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt as unknown as string);
    const existing = sessionsBySid.get(sid);
    if (existing) {
      existing.msgCount++;
      if (at < existing.firstAt) existing.firstAt = at;
    } else {
      sessionsBySid.set(sid, { firstAt: at, msgCount: 1 });
    }
  }

  const total = sessionsBySid.size;

  // Hora pico (0-23 Colombia) — por volumen de mensajes, no solo apertura de sesión
  const hourBuckets = new Array(24).fill(0) as number[];
  const byMonthSessions = new Map<string, number>();
  for (const m of monthKeys) byMonthSessions.set(m, 0);

  for (const m of messages) {
    const sid = typeof m.sessionId === 'string' ? m.sessionId : '';
    if (isExcludedConversationSessionId(sid)) continue;
    const at = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt as unknown as string);
    if (isNaN(at.getTime())) continue;
    hourBuckets[colombiaHour(at)]++;
  }

  for (const s of sessionsBySid.values()) {
    const mk = colombiaMonth(s.firstAt);
    if (byMonthSessions.has(mk)) byMonthSessions.set(mk, (byMonthSessions.get(mk) || 0) + 1);
  }

  const peakHour = findPeakHour(hourBuckets);

  const avgMsgsPerSession = total
    ? Math.round(Array.from(sessionsBySid.values()).reduce((s, r) => s + r.msgCount, 0) / total)
    : 0;

  // ── Métricas avanzadas: handoffs + sentiment + duración desde ConversationSession ──
  // Estos sí dependen de eventos formales. Devolvemos lo que haya, sin bloquear el resto.
  const formalSessions = await ConversationSession.find({
    widgetId: id,
    userId,
    month: { $in: monthKeys },
  }).select({
    month: 1, durationSec: 1, sentiment: 1, escalated: 1, dropped: 1, resolved: 1,
  }).lean() as Array<{
    month?: string; durationSec?: number | null; sentiment?: string;
    escalated?: boolean; dropped?: boolean; resolved?: boolean | null;
  }>;

  const withDuration = formalSessions.filter(s => s.durationSec != null);
  const avgDuration = withDuration.length
    ? Math.round(withDuration.reduce((s, r) => s + (r.durationSec ?? 0), 0) / withDuration.length)
    : null;
  const escalatedCount = formalSessions.filter(s => s.escalated).length;
  const droppedCount = formalSessions.filter(s => s.dropped).length;
  const resolvedCount = formalSessions.filter(s => s.resolved === true).length;
  const formalTotal = formalSessions.length || total; // si no hay metadata, usa total real

  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  for (const s of formalSessions) {
    const key = (s.sentiment || 'neutral') as keyof typeof sentimentCounts;
    if (key in sentimentCounts) sentimentCounts[key]++;
  }

  // RequestLog conversaciones por mes (legacy/back compat)
  const requestLogs = await RequestLog.find({
    widgetId: id,
    month: { $in: monthKeys },
  }).select({ month: 1, count: 1 }).lean() as Array<{ month: string; count?: number }>;

  const byMonth = monthKeys.map(m => ({
    month: m,
    sessions: byMonthSessions.get(m) || 0,
    conversations: requestLogs.find(r => r.month === m)?.count ?? 0,
  }));

  // ── Satisfacción ──
  const feedbacks = await WidgetFeedback.find({
    widgetId: id, userId, createdAt: { $gte: sinceUTC },
  }).select({ score: 1 }).lean() as { score?: number | null }[];
  const fbScored = feedbacks.filter(f => typeof f.score === 'number') as { score: number }[];
  const fbAvg = fbScored.length
    ? Math.round((fbScored.reduce((s, f) => s + f.score, 0) / fbScored.length) * 10) / 10
    : null;
  const fbDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const f of fbScored) {
    const r = Math.round(f.score);
    if (r >= 1 && r <= 5) fbDist[r] += 1;
  }

  return NextResponse.json({
    widgetId: id,
    widgetName: widget.name || id,
    period: {
      from: sinceUTC.toISOString(),
      to: untilUTC.toISOString(),
      monthKeys,
      timezone: 'America/Bogota',
    },
    summary: {
      totalSessions: total,
      avgDurationSec: avgDuration,
      avgMessagesPerSession: avgMsgsPerSession,
      escalationRate: formalTotal ? Math.round((escalatedCount / formalTotal) * 100) : 0,
      dropOffRate: formalTotal ? Math.round((droppedCount / formalTotal) * 100) : 0,
      resolutionRate: formalTotal ? Math.round((resolvedCount / formalTotal) * 100) : 0,
    },
    sentiment: sentimentCounts,
    peakHour,
    hourDistribution: hourBuckets,
    byMonth,
    satisfaction: {
      avgScore: fbAvg,
      totalResponses: feedbacks.length,
      scoredResponses: fbScored.length,
      distribution: fbDist,
      responseRate: total ? Math.round((feedbacks.length / total) * 100) : 0,
    },
  });
}
