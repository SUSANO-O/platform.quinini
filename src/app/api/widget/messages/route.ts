/**
 * GET /api/widget/messages?sessionId=X&since=ISO&token=wt_*
 * Polling ligero: el widget consulta si llegaron mensajes humanos nuevos
 * (o si la sesión fue marcada como resuelta) mientras está en modo humano.
 *
 * Auth: X-Widget-Token (wt_*) — igual que /api/widget/chat.
 * No requiere sesión de usuario (lo usa el visitante desde el widget).
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget, WidgetMessage, ConversationSession } from '@/lib/db/models';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-widget-token') || '';
  const sessionId = req.nextUrl.searchParams.get('sessionId') || '';
  const since = req.nextUrl.searchParams.get('since') || '';

  if (!token || !sessionId) {
    return NextResponse.json({ error: 'Faltan parámetros.' }, { status: 400 });
  }

  await connectDB();

  // Verificar token → widgetId.
  const widget = await Widget.findOne({ afhubToken: token }).select({ _id: 1, active: 1 }).lean() as {
    _id: unknown;
    active?: boolean;
  } | null;
  if (!widget || widget.active === false) {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
  }
  const widgetId = String(widget._id);

  // Comprobar si la sesión está resuelta (para notificar al widget).
  const session = await ConversationSession.findOne({ chatSessionId: sessionId })
    .select({ inboxStatus: 1, humanMode: 1 })
    .lean() as { inboxStatus?: string; humanMode?: boolean } | null;

  const resolved = session?.inboxStatus === 'resolved';

  // Mensajes nuevos desde `since` con sentBy: 'human'.
  const sinceDate = since ? new Date(since) : new Date(0);
  const messages = await WidgetMessage.find({
    widgetId,
    sessionId,
    sentBy: 'human',
    createdAt: { $gt: sinceDate },
  })
    .sort({ createdAt: 1 })
    .limit(50)
    .select({ content: 1, sentBy: 1, createdAt: 1 })
    .lean();

  return NextResponse.json({
    messages,
    resolved,
    humanMode: session?.humanMode ?? false,
    // Hora del servidor: el cliente la usa como cursor del siguiente poll
    // para evitar drift de reloj del navegador.
    now: new Date().toISOString(),
  });
}
