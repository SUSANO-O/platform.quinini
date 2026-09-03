/**
 * GET /api/widget/load-events — eventos de carga del widget (widget_loaded) del usuario.
 * Cada fila = una carga de página con el widget embebido: IP, hora, widget, referrer.
 * Reemplaza a los ConversationSession vacíos que antes se creaban al abrir el panel.
 *
 * Query params: limit=60 (máx 200), widgetId=<id> (opcional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { WidgetLoadEvent, Widget } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '60', 10) || 60));
  const widgetId = (req.nextUrl.searchParams.get('widgetId') || '').trim();

  await connectDB();

  const filter: Record<string, unknown> = { userId };
  if (widgetId) filter.widgetId = widgetId;

  const events = await WidgetLoadEvent.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const widgetIds = [...new Set(events.map((e) => String(e.widgetId)).filter(Boolean))];
  const widgets = widgetIds.length
    ? await Widget.find({ _id: { $in: widgetIds } }).select({ name: 1 }).lean()
    : [];
  const widgetNameById = new Map(widgets.map((w) => [String(w._id), typeof w.name === 'string' ? w.name : '']));

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const totalCount = await WidgetLoadEvent.countDocuments(filter);
  const last24hCount = await WidgetLoadEvent.countDocuments({ ...filter, createdAt: { $gte: since24h } });

  const items = events.map((e) => ({
    id: String(e._id),
    widgetId: String(e.widgetId || ''),
    widgetName: widgetNameById.get(String(e.widgetId)) || String(e.widgetId || ''),
    agentId: e.agentId || '',
    sessionId: e.sessionId || '',
    ip: e.ip || '',
    hourOfDay: typeof e.hourOfDay === 'number' ? e.hourOfDay : null,
    dayOfWeek: typeof e.dayOfWeek === 'number' ? e.dayOfWeek : null,
    pageUrl: e.pageUrl || '',
    referrer: e.referrer || '',
    userAgent: e.userAgent || '',
    createdAt: e.createdAt ? new Date(e.createdAt as Date).toISOString() : null,
  }));

  return NextResponse.json({ items, totalCount, last24hCount });
}
