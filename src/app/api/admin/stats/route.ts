/**
 * GET /api/admin/stats — resumen general
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription, Widget, RequestLog } from '@/lib/db/models';
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

  const MRR: Record<string, number> = { starter: 19, growth: 49, business: 129 };
  const mrr = subs
    .filter((s) => s.status === 'active')
    .reduce((acc, s) => acc + (MRR[s.plan] || 0), 0);

  // Per-user request summary this month
  const month = new Date().toISOString().slice(0, 7);
  const perUser = await RequestLog.aggregate([
    { $match: { month } },
    { $group: { _id: '$userId', total: { $sum: '$count' } } },
    { $sort: { total: -1 } },
    { $limit: 10 },
  ]);

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
  });
}
