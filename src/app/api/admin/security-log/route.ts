/**
 * GET /api/admin/security-log
 *
 * Devuelve los últimos eventos de seguridad del flujo de chat.
 * Solo accesible para admins.
 *
 * Query params:
 *   limit   = 100 (max 500)
 *   event   = filtrar por tipo de evento
 *   ip      = filtrar por IP
 *   widgetId = filtrar por widget
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { SecurityLog, User } from '@/lib/db/models';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();

  const user = await User.findById(userId).select({ role: 1 }).lean() as { role?: string } | null;
  if (user?.role !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit    = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)));
  const event    = url.searchParams.get('event')    || undefined;
  const ip       = url.searchParams.get('ip')       || undefined;
  const widgetId = url.searchParams.get('widgetId') || undefined;

  const filter: Record<string, unknown> = {};
  if (event)    filter.event    = event;
  if (ip)       filter.ip       = ip;
  if (widgetId) filter.widgetId = widgetId;

  const logs = await SecurityLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // Summary: group by event for quick overview
  const summary = await SecurityLog.aggregate([
    { $match: { createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60_000) } } },
    { $group: { _id: '$event', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  return NextResponse.json({ logs, summary, total: logs.length });
}
