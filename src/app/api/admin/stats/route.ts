/**
 * GET /api/admin/stats — resumen general
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription, Widget, RequestLog } from '@/lib/db/models';
import { PLAN_CONVERSATION_LIMITS } from '@/lib/plan-catalog';
import { verifySessionToken } from '@/lib/auth';

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

  // Get non-admin user IDs
  const regularUsers = await User.find({ role: { $ne: 'admin' } }, { _id: 1 }).lean() as Array<{ _id: { toString(): string } }>;
  const regularUserIds = regularUsers.map((u) => u._id.toString());

  const [totalUsers, totalWidgets, subs, requestsThisMonth, topWidgets] = await Promise.all([
    User.countDocuments({ role: { $ne: 'admin' } }),
    Widget.countDocuments({ userId: { $in: regularUserIds } }),
    // Only count subscriptions for non-admin users
    Subscription.find({ userId: { $in: regularUserIds } }).lean() as Promise<Array<{ status: string; plan: string }>>,
    // Total requests this calendar month
    (async () => {
      const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
      const agg = await RequestLog.aggregate([
        { $match: { month } },
        { $group: { _id: null, total: { $sum: '$count' } } },
      ]);
      return agg[0]?.total ?? 0;
    })(),
    // Top 5 widgets by all-time requests
    RequestLog.aggregate([
      { $group: { _id: '$widgetId', total: { $sum: '$count' } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const trialing = subs.filter((s) => s.status === 'trialing').length;
  const active   = subs.filter((s) => s.status === 'active').length;
  const canceled = subs.filter((s) => s.status === 'canceled').length;

  const MRR: Record<string, number> = { starter: 29, growth: 79, business: 199 };
  const mrr = subs
    .filter((s) => s.status === 'active')
    .reduce((acc, s) => acc + (MRR[s.plan] || 0), 0);

  // Per-user request summary this month + quota analysis
  const month = new Date().toISOString().slice(0, 7);

  const [perUserRaw, allUsers] = await Promise.all([
    RequestLog.aggregate([
      { $match: { month } },
      { $group: { _id: '$userId', total: { $sum: '$count' } } },
      { $sort: { total: -1 } },
      { $limit: 50 },
    ]),
    User.find({ role: { $ne: 'admin' } }, { _id: 1, email: 1, displayName: 1 }).lean() as Promise<
      Array<{ _id: { toString(): string }; email: string; displayName?: string }>
    >,
  ]);

  // Build userId → email map
  const userMap: Record<string, string> = {};
  for (const u of allUsers) userMap[u._id.toString()] = u.email;

  // Build userId → plan map
  const subMap: Record<string, { plan: string; status: string }> = {};
  for (const s of subs as Array<{ userId?: string; plan: string; status: string }>) {
    if (s.userId) subMap[s.userId] = { plan: s.plan, status: s.status };
  }

  const perUser = perUserRaw.map((row: { _id: string; total: number }) => {
    const uid = row._id;
    const sub = subMap[uid];
    const effectivePlan = sub && ['active', 'trialing'].includes(sub.status) ? sub.plan : 'free';
    const limit = PLAN_CONVERSATION_LIMITS[effectivePlan] ?? 50;
    const percent = limit === -1 ? 0 : Math.round((row.total / limit) * 100);
    return {
      userId: uid,
      email: userMap[uid] || uid,
      plan: effectivePlan,
      used: row.total,
      limit,
      percent,
    };
  });

  const usersOverQuota  = perUser.filter((u) => u.limit !== -1 && u.percent >= 100).length;
  const usersNearQuota  = perUser.filter((u) => u.limit !== -1 && u.percent >= 80 && u.percent < 100).length;
  const totalCapacity   = Object.values(subMap).reduce((acc, s) => {
    const ep = ['active', 'trialing'].includes(s.status) ? s.plan : 'free';
    const lim = PLAN_CONVERSATION_LIMITS[ep] ?? 50;
    return acc + (lim === -1 ? 0 : lim);
  }, 0);

  return NextResponse.json({
    totalUsers,
    totalWidgets,
    trialing,
    active,
    canceled,
    mrr,
    requestsThisMonth,
    topWidgets,
    perUserRequests: perUser,
    usersOverQuota,
    usersNearQuota,
    totalCapacity,
  });
}
