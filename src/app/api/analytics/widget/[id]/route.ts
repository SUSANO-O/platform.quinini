/**
 * GET /api/analytics/widget/[id]?months=3
 *
 * Analytics enriquecido de un widget: duración promedio, tasa de resolución,
 * sentimiento, pico horario, tasa de escalación, drop-off.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Widget, ConversationSession, RequestLog, WidgetFeedback } from '@/lib/db/models';

function auth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

function generatePastMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
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
  const months = Math.min(12, Math.max(1, Number(url.searchParams.get('months') || '3')));

  await connectDB();

  const widget = await Widget.findOne({ _id: id, userId }).select({ name: 1 }).lean() as { name?: string } | null;
  if (!widget) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  const monthKeys = generatePastMonths(months);

  const [sessions, requestLogs] = await Promise.all([
    ConversationSession.find({
      widgetId: id,
      userId,
      month: { $in: monthKeys },
    }).select({
      month: 1, durationSec: 1, sentiment: 1, escalated: 1, dropped: 1,
      resolved: 1, hourOfDay: 1, dayOfWeek: 1, messageCount: 1,
    }).lean() as Promise<{
      month: string;
      durationSec?: number | null;
      sentiment?: string;
      escalated?: boolean;
      dropped?: boolean;
      resolved?: boolean | null;
      hourOfDay?: number | null;
      dayOfWeek?: number | null;
      messageCount?: number;
    }[]>,
    RequestLog.find({
      widgetId: id,
      month: { $in: monthKeys },
    }).select({ month: 1, count: 1 }).lean() as Promise<{ month: string; count?: number }[]>,
  ]);

  const total = sessions.length;
  const withDuration = sessions.filter(s => s.durationSec != null);
  const avgDuration = withDuration.length
    ? Math.round(withDuration.reduce((s, r) => s + (r.durationSec ?? 0), 0) / withDuration.length)
    : null;

  const escalatedCount = sessions.filter(s => s.escalated).length;
  const droppedCount = sessions.filter(s => s.dropped).length;
  const resolvedCount = sessions.filter(s => s.resolved === true).length;

  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  for (const s of sessions) {
    const key = (s.sentiment || 'neutral') as keyof typeof sentimentCounts;
    if (key in sentimentCounts) sentimentCounts[key]++;
  }

  // Peak hours (0-23)
  const hourBuckets = new Array(24).fill(0) as number[];
  for (const s of sessions) {
    if (s.hourOfDay != null) hourBuckets[s.hourOfDay]++;
  }
  const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));

  // By month
  const byMonthMap = new Map<string, { sessions: number; conversations: number }>();
  for (const m of monthKeys) byMonthMap.set(m, { sessions: 0, conversations: 0 });
  for (const s of sessions) {
    const entry = byMonthMap.get(s.month);
    if (entry) entry.sessions++;
  }
  for (const r of requestLogs) {
    const entry = byMonthMap.get(r.month);
    if (entry) entry.conversations += r.count ?? 0;
  }

  const byMonth = monthKeys.map(m => ({
    month: m,
    ...byMonthMap.get(m)!,
  }));

  const avgMsgsPerSession = total
    ? Math.round(sessions.reduce((s, r) => s + (r.messageCount ?? 0), 0) / total)
    : 0;

  // ── Satisfacción (encuesta final) ────────────────────────────────────────
  const oldest = monthKeys[monthKeys.length - 1] || monthKeys[0];
  const [oy, om] = oldest.split('-').map(Number);
  const sinceDate = new Date(oy, (om || 1) - 1, 1);
  const feedbacks = await WidgetFeedback.find({ widgetId: id, userId, createdAt: { $gte: sinceDate } })
    .select({ score: 1 }).lean() as { score?: number | null }[];
  const fbScored = feedbacks.filter((f) => typeof f.score === 'number') as { score: number }[];
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
    period: { months, monthKeys },
    summary: {
      totalSessions: total,
      avgDurationSec: avgDuration,
      avgMessagesPerSession: avgMsgsPerSession,
      escalationRate: total ? Math.round((escalatedCount / total) * 100) : 0,
      dropOffRate: total ? Math.round((droppedCount / total) * 100) : 0,
      resolutionRate: total ? Math.round((resolvedCount / total) * 100) : 0,
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
