/**
 * GET /api/admin/widget-analytics — uso de widgets (RequestLog + PlatformUsage) para panel admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { User, Widget, RequestLog, PlatformUsage } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function previousMonthKey(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  await connectDB();
  const user = await User.findById(userId).lean() as { role?: string } | null;
  if (!user || user.role !== 'admin') return null;
  return userId;
}

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const month = currentMonthKey();
  const prevMonth = previousMonthKey(month);

  const [
    widgetsTotal,
    requestsThisMonthAgg,
    byWidgetMonth,
    byWidgetAllTime,
    platformAgg,
    widgets,
  ] = await Promise.all([
    Widget.countDocuments({}),
    RequestLog.aggregate([
      { $match: { month } },
      { $group: { _id: null, total: { $sum: '$count' } } },
    ]),
    RequestLog.aggregate([
      { $match: { month: { $in: [month, prevMonth] } } },
      { $group: { _id: { widgetId: '$widgetId', month: '$month' }, count: { $sum: '$count' } } },
    ]),
    RequestLog.aggregate([{ $group: { _id: '$widgetId', total: { $sum: '$count' } } }]),
    PlatformUsage.aggregate([
      { $match: { month } },
      { $group: { _id: null, total: { $sum: '$platformFreeUsed' } } },
    ]),
    Widget.find({})
      .sort({ updatedAt: -1 })
      .limit(400)
      .lean() as Promise<
      Array<{
        _id: mongoose.Types.ObjectId;
        userId: string;
        name: string;
        agentId: string;
        afhubToken?: string | null;
        updatedAt?: Date;
      }>
    >,
  ]);

  const requestsThisMonth = requestsThisMonthAgg[0]?.total ?? 0;
  const platformChatsThisMonth = platformAgg[0]?.total ?? 0;

  const monthCounts = new Map<string, { cur: number; prev: number }>();
  for (const row of byWidgetMonth) {
    const wid = String(row._id.widgetId);
    const m = String(row._id.month);
    const c = Number(row.count) || 0;
    let e = monthCounts.get(wid);
    if (!e) {
      e = { cur: 0, prev: 0 };
      monthCounts.set(wid, e);
    }
    if (m === month) e.cur += c;
    else if (m === prevMonth) e.prev += c;
  }

  const allTimeMap = new Map<string, number>(
    byWidgetAllTime.map((x) => [String(x._id), Number(x.total) || 0]),
  );

  const userIds = [...new Set(widgets.map((w) => w.userId))];
  const oidList = userIds
    .filter((id) => /^[a-f0-9]{24}$/i.test(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const users =
    oidList.length === 0
      ? []
      : ((await User.find({ _id: { $in: oidList } })
          .select({ email: 1 })
          .lean()) as Array<{ _id: mongoose.Types.ObjectId; email: string }>);
  const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));

  const rows = widgets.map((w) => {
    const id = w._id.toString();
    const mc = monthCounts.get(id) ?? { cur: 0, prev: 0 };
    return {
      widgetId: id,
      widgetName: w.name,
      userId: w.userId,
      userEmail: emailByUserId.get(w.userId) ?? '(usuario)',
      agentId: w.agentId,
      hasToken: Boolean(w.afhubToken && String(w.afhubToken).startsWith('wt_')),
      requestsThisMonth: mc.cur,
      requestsLastMonth: mc.prev,
      requestsAllTime: allTimeMap.get(id) ?? 0,
      updatedAt: w.updatedAt?.toISOString() ?? null,
    };
  });

  rows.sort((a, b) => b.requestsThisMonth - a.requestsThisMonth || b.requestsAllTime - a.requestsAllTime);

  const topByMonth = [...monthCounts.entries()]
    .map(([widgetId, v]) => ({
      widgetId,
      requestsThisMonth: v.cur,
      requestsLastMonth: v.prev,
      totalWindow: v.cur + v.prev,
    }))
    .sort((a, b) => b.requestsThisMonth - a.requestsThisMonth)
    .slice(0, 15);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    window: { month, prevMonth },
    summary: {
      widgetsTotal,
      requestsThisMonth,
      requestsLastMonthWindow: [...monthCounts.values()].reduce((s, v) => s + v.prev, 0),
      platformChatsThisMonth,
    },
    note:
      'Contadores de chat vía gateway/widget (RequestLog) y mensajes gratis a agentes de plataforma (PlatformUsage). ' +
      'Eventos del SDK (apertura, errores) se reenvían al AgentFlowhub y no se listan aquí.',
    topByMonth,
    rows,
  });
}
