/**
 * GET /api/admin/users?page=1&limit=20&status=trialing|active|canceled&search=
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription, Widget, ClientAgent, RequestLog } from '@/lib/db/models';
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

  const page   = parseInt(req.nextUrl.searchParams.get('page') || '1');
  const limit  = parseInt(req.nextUrl.searchParams.get('limit') || '20');
  const status = req.nextUrl.searchParams.get('status') || '';
  const search = req.nextUrl.searchParams.get('search') || '';

  const skip = (page - 1) * limit;

  const userQuery: Record<string, unknown> = {};
  if (search) {
    // Escape regex special chars to prevent ReDoS
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);
    userQuery.email = { $regex: escaped, $options: 'i' };
  }

  const [users, total] = await Promise.all([
    User.find(userQuery).sort({ createdAt: -1 }).skip(skip).limit(limit).lean() as Promise<Array<{ _id: unknown; email: string; displayName?: string; role?: string; createdAt: Date }>>,
    User.countDocuments(userQuery),
  ]);

  const userIds = users.map((u) => u._id!.toString());
  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const [subs, widgetCounts, agentCounts, requestCounts] = await Promise.all([
    Subscription.find({ userId: { $in: userIds } }).lean() as Promise<Array<{ userId: string; status: string; plan: string; trialEndsAt?: Date; currentPeriodEnd?: number }>>,
    Widget.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]),
    ClientAgent.aggregate([
      { $match: { userId: { $in: userIds }, type: 'agent' } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]),
    RequestLog.aggregate([
      { $match: { userId: { $in: userIds }, month } },
      { $group: { _id: '$userId', total: { $sum: '$count' } } },
    ]),
  ]);

  const subMap     = Object.fromEntries(subs.map((s) => [s.userId, s]));
  const widgetMap  = Object.fromEntries(widgetCounts.map((w: { _id: string; count: number }) => [w._id, w.count]));
  const agentMap   = Object.fromEntries(agentCounts.map((a: { _id: string; count: number }) => [a._id, a.count]));
  const requestMap = Object.fromEntries(requestCounts.map((r: { _id: string; total: number }) => [r._id, r.total]));

  let rows = users.map((u) => {
    const uid = u._id!.toString();
    const sub = subMap[uid];
    const trialEndsAt = sub?.trialEndsAt;
    const now = Date.now();
    const trialDaysRemaining = trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now) / (1000 * 60 * 60 * 24)))
      : 0;
    return {
      uid,
      email:               u.email,
      displayName:         u.displayName || '',
      role:                u.role || 'user',
      createdAt:           u.createdAt,
      widgets:             widgetMap[uid] || 0,
      agents:              agentMap[uid] || 0,
      requestsThisMonth:   requestMap[uid] || 0,
      status:              sub?.status || 'no_sub',
      plan:                sub?.plan || '—',
      trialEndsAt:         sub?.trialEndsAt || null,
      trialDaysRemaining,
      periodEnd:           sub?.currentPeriodEnd || 0,
    };
  });

  if (status) rows = rows.filter((r) => r.status === status);

  return NextResponse.json({ users: rows, total, page, pages: Math.ceil(total / limit) });
}
