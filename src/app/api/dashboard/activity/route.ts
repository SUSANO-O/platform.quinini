/**
 * GET /api/dashboard/activity?from=&to=
 * Serie diaria de conversaciones widget + API para gráfico de ondas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession, Subscription } from '@/lib/db/models';
import { inboxSessionFilter } from '@/lib/inbox-handoff';
import { countUserDailyConversationSeries } from '@/lib/conversation-daily-log';
import {
  buildWidgetDailyMaps,
  countUserBillableTurnsInRange,
  countUserConversationsStartedInRange,
  countUserHourlyTrafficInRange,
} from '@/lib/conversation-metrics';
import { formatHourColombia24, colombiaMonthStart } from '@/lib/colombia-time';
import { canUseApiAccess } from '@/lib/plan-catalog';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  try {
    await connectDB();
    const url = new URL(req.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');

    if (!fromParam || !toParam) {
      return NextResponse.json({ error: 'from y to son requeridos (ISO 8601).' }, { status: 400 });
    }

    const from = new Date(fromParam);
    const to = new Date(toParam);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json({ error: 'from/to inválidos.' }, { status: 400 });
    }

    const sub = await Subscription.findOne({ userId })
      .select({ plan: 1, status: 1, features: 1 })
      .lean() as { plan?: string; status?: string; features?: string[] } | null;

    const hasApiAccess = canUseApiAccess(
      sub?.plan ?? 'free',
      sub?.status ?? 'free',
      sub?.features ?? [],
    );

    const [widgetMaps, sessionsStarted, inboxOpen, hourly] = await Promise.all([
      buildWidgetDailyMaps(userId, from, to),
      countUserConversationsStartedInRange(userId, from, to),
      ConversationSession.countDocuments({
        $and: [
          inboxSessionFilter(userId, 'open'),
          {
            $or: [
              { agentLastSeenAt: null },
              {
                lastVisitorMessageAt: { $ne: null },
                $expr: { $gt: ['$lastVisitorMessageAt', '$agentLastSeenAt'] },
              },
            ],
          },
        ],
      }),
      countUserHourlyTrafficInRange(userId, from, to),
    ]);

    const byDay = await countUserDailyConversationSeries(
      userId,
      from,
      to,
      widgetMaps.turnsByDay,
      widgetMaps.sessionsByDay,
    );

    const monthStart = colombiaMonthStart();
    const [monthlyBillableTurns, billableTurns] = await Promise.all([
      countUserBillableTurnsInRange(userId, monthStart, to),
      countUserBillableTurnsInRange(userId, from, to),
    ]);

    const totalAgents = byDay.reduce((s, d) => s + d.agents, 0);
    const totalApi = byDay.reduce((s, d) => s + d.api, 0);

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      hasApiAccess,
      billableTurns,
      monthlyBillableTurns,
      totalAgents,
      totalApi,
      sessionsStarted,
      inboxOpen,
      peakHour: hourly.peakHour,
      peakHourLabel: hourly.peakHour != null ? formatHourColombia24(hourly.peakHour) : null,
      peakHourCount: hourly.peakHour != null ? hourly.hourBuckets[hourly.peakHour] : 0,
      byDay,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[dashboard/activity]', msg);
    return NextResponse.json({ error: 'No se pudo obtener actividad.' }, { status: 500 });
  }
}
