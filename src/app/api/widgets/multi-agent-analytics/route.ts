/**
 * GET /api/widgets/multi-agent-analytics
 * Métricas de routing multiagente (Business / Enterprise) para el dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession, Subscription, Widget } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { isMultiAgentPlanEligible } from '@/lib/widget-multi-agent';

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  const userId = token ? verifySessionToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();

  const sub = await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1 })
    .lean() as { plan?: string; status?: string } | null;
  const active = sub?.status === 'active' || sub?.status === 'trialing';
  const plan = active ? (sub?.plan ?? 'free') : 'free';

  if (!isMultiAgentPlanEligible(plan)) {
    return NextResponse.json(
      { error: 'Analytics multiagente disponible en Business y Enterprise.', code: 'MULTI_AGENT_PLAN_REQUIRED' },
      { status: 403 },
    );
  }

  const month = req.nextUrl.searchParams.get('month')?.trim() || currentMonthKey();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Mes inválido (YYYY-MM).' }, { status: 400 });
  }

  const [agg, byWidget, multiWidgets] = await Promise.all([
    ConversationSession.aggregate([
      { $match: { userId, month, multiAgentRouted: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          sessionsWithRouting: { $sum: 1 },
          totalRouted: { $sum: '$multiAgentRouted' },
          totalHandoffs: { $sum: '$multiAgentHandoffs' },
          totalParallel: { $sum: '$multiAgentParallel' },
        },
      },
    ]),
    ConversationSession.aggregate([
      { $match: { userId, month, multiAgentRouted: { $gt: 0 } } },
      {
        $group: {
          _id: '$widgetId',
          routed: { $sum: '$multiAgentRouted' },
          handoffs: { $sum: '$multiAgentHandoffs' },
          parallel: { $sum: '$multiAgentParallel' },
          sessions: { $sum: 1 },
        },
      },
      { $sort: { routed: -1 } },
      { $limit: 20 },
    ]),
    Widget.find({ userId, multiAgentEnabled: true })
      .select({ name: 1, multiAgentMode: 1, agentId: 1 })
      .lean(),
  ]);

  const totals = agg[0] ?? {
    sessionsWithRouting: 0,
    totalRouted: 0,
    totalHandoffs: 0,
    totalParallel: 0,
  };

  const widgetNameById = new Map(
    multiWidgets.map((w) => [String(w._id), typeof w.name === 'string' ? w.name : 'Widget']),
  );

  return NextResponse.json({
    month,
    plan,
    totals,
    enabledWidgets: multiWidgets.length,
    byWidget: byWidget.map((row) => ({
      widgetId: String(row._id ?? ''),
      widgetName: widgetNameById.get(String(row._id ?? '')) ?? 'Widget',
      routed: row.routed ?? 0,
      handoffs: row.handoffs ?? 0,
      parallel: row.parallel ?? 0,
      sessions: row.sessions ?? 0,
    })),
  });
}
