/**
 * GET /api/admin/widget-analytics — uso de widgets (RequestLog + PlatformUsage) para panel admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { User, Widget, RequestLog, PlatformUsage, ClientAgent } from '@/lib/db/models';
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
    agentsMinimal,
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
    ClientAgent.find({})
      .select({
        _id: 1,
        userId: 1,
        name: 1,
        type: 1,
        parentAgentId: 1,
        status: 1,
        agentHubId: 1,
        syncStatus: 1,
        updatedAt: 1,
      })
      .limit(2000)
      .lean() as Promise<
      Array<{
        _id: mongoose.Types.ObjectId;
        userId: string;
        name: string;
        type?: string;
        parentAgentId?: string | null;
        status: string;
        agentHubId?: string | null;
        syncStatus?: string;
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

  const userIds = [
    ...new Set([...widgets.map((w) => w.userId), ...agentsMinimal.map((a) => a.userId)]),
  ];
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

  const nameByAgentId = new Map(agentsMinimal.map((a) => [a._id.toString(), a.name]));
  const agentKindById = new Map(
    agentsMinimal.map((a) => [a._id.toString(), a.type === 'sub-agent' ? 'sub-agent' : 'agent'] as const),
  );

  const subAgentInventory = agentsMinimal
    .filter((a) => a.type === 'sub-agent')
    .map((a) => {
      const id = a._id.toString();
      const pid = a.parentAgentId ? String(a.parentAgentId) : null;
      return {
        id,
        name: a.name,
        parentAgentId: pid,
        parentName: pid ? (nameByAgentId.get(pid) ?? '(desconocido)') : null,
        userId: a.userId,
        userEmail: emailByUserId.get(a.userId) ?? '(usuario)',
        status: a.status,
        hubSlug: a.agentHubId ?? null,
        syncStatus: a.syncStatus ?? 'pending',
        updatedAt: a.updatedAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  const rows = widgets.map((w) => {
    const id = w._id.toString();
    const mc = monthCounts.get(id) ?? { cur: 0, prev: 0 };
    const kind = agentKindById.get(w.agentId) ?? 'agent';
    return {
      widgetId: id,
      widgetName: w.name,
      userId: w.userId,
      userEmail: emailByUserId.get(w.userId) ?? '(usuario)',
      agentId: w.agentId,
      agentKind: kind,
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
      'Eventos del SDK (apertura, errores) se reenvían al AgentFlowhub y no se listan aquí. ' +
      'La traza fina (router/worker/MCP por subagente) vive en AgentFlowhub → Granja → Supervisión.',
    topByMonth,
    rows,
    supervision: {
      subAgentsTotal: subAgentInventory.length,
      subAgentsActive: subAgentInventory.filter((s) => s.status === 'active').length,
      inventory: subAgentInventory.slice(0, 300),
    },
  });
}
