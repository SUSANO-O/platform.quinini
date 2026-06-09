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
import { withCors, handlePreflight } from '@/lib/cors';

/** Preflight CORS — el widget embebido en sitios externos consulta este endpoint. */
export async function OPTIONS(req: NextRequest) {
  return handlePreflight(req) ?? new NextResponse(null, { status: 204 });
}

/**
 * POST /api/widget/messages — el widget acusa "visto" de mensajes humanos.
 * Body: { token, sessionId, ids: [messageId,...] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = (body?.token || req.headers.get('x-widget-token') || '').toString().trim();
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  const ids = Array.isArray(body?.ids)
    ? (body.ids as unknown[]).filter((x) => typeof x === 'string' && /^[a-f0-9]{24}$/i.test(x)).slice(0, 50)
    : [];

  if (!token.startsWith('wt_') || !sessionId || !ids.length) {
    return withCors(req, NextResponse.json({ ok: false }, { status: 400 }));
  }

  await connectDB();
  const widget = await Widget.findOne({ afhubToken: token }).select({ _id: 1, active: 1 }).lean() as {
    _id: unknown; active?: boolean;
  } | null;
  if (!widget || widget.active === false) {
    return withCors(req, NextResponse.json({ ok: false }, { status: 401 }));
  }

  const now = new Date();
  await WidgetMessage.updateMany(
    {
      _id: { $in: ids },
      widgetId: String(widget._id),
      sessionId,
      sentBy: 'human',
      readAt: null,
    },
    { $set: { readAt: now } },
  ).catch(() => {});
  await WidgetMessage.updateMany(
    {
      _id: { $in: ids },
      widgetId: String(widget._id),
      sessionId,
      sentBy: 'human',
      deliveredAt: null,
    },
    { $set: { deliveredAt: now } },
  ).catch(() => {});

  return withCors(req, NextResponse.json({ ok: true }));
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-widget-token') || '';
  const sessionId = req.nextUrl.searchParams.get('sessionId') || '';
  const since = req.nextUrl.searchParams.get('since') || '';

  if (!token || !sessionId) {
    return withCors(req, NextResponse.json({ error: 'Faltan parámetros.' }, { status: 400 }));
  }

  await connectDB();

  // Verificar token → widgetId.
  const widget = await Widget.findOne({ afhubToken: token }).select({ _id: 1, active: 1 }).lean() as {
    _id: unknown;
    active?: boolean;
  } | null;
  if (!widget || widget.active === false) {
    return withCors(req, NextResponse.json({ error: 'Token inválido.' }, { status: 401 }));
  }
  const widgetId = String(widget._id);

  // Puede haber varios ho_* por chatSessionId (handoffs viejos resueltos + uno abierto).
  // findOne sin orden devolvía a veces el resuelto → el widget creía que la conversación terminó.
  const openSession = await ConversationSession.findOne({
    chatSessionId: sessionId,
    escalated: true,
    inboxStatus: { $ne: 'resolved' },
  })
    .sort({ handoffAt: -1 })
    .select({ inboxStatus: 1, humanMode: 1 })
    .lean() as { inboxStatus?: string; humanMode?: boolean } | null;

  let resolved: boolean;
  let humanMode: boolean;
  if (openSession) {
    resolved = false;
    humanMode = openSession.humanMode ?? true;
  } else {
    const lastSession = await ConversationSession.findOne({
      chatSessionId: sessionId,
      escalated: true,
    })
      .sort({ handoffAt: -1 })
      .select({ inboxStatus: 1, humanMode: 1 })
      .lean() as { inboxStatus?: string; humanMode?: boolean } | null;
    resolved = lastSession?.inboxStatus === 'resolved';
    humanMode = lastSession?.humanMode ?? false;
  }

  // Mensajes nuevos desde `since` con sentBy: 'human' (excluye los retirados).
  const sinceDate = since ? new Date(since) : new Date(0);
  const messages = await WidgetMessage.find({
    widgetId,
    sessionId,
    sentBy: 'human',
    deleted: { $ne: true },
    createdAt: { $gt: sinceDate },
  })
    .sort({ createdAt: 1 })
    .limit(50)
    .select({ content: 1, sentBy: 1, createdAt: 1, attachments: 1 })
    .lean() as Array<{ _id: unknown; content?: string; createdAt?: Date; attachments?: unknown[] }>;

  // Acuse de "recibido": el widget acaba de descargar estos mensajes humanos.
  if (messages.length) {
    WidgetMessage.updateMany(
      { _id: { $in: messages.map((m) => m._id) }, deliveredAt: null },
      { $set: { deliveredAt: new Date() } },
    ).catch(() => {});
  }

  // IDs de mensajes retirados recientemente (updatedAt > since) para que el widget
  // los elimine de la vista del cliente.
  const deletedDocs = await WidgetMessage.find({
    widgetId,
    sessionId,
    sentBy: 'human',
    deleted: true,
    updatedAt: { $gt: sinceDate },
  })
    .select({ _id: 1 })
    .lean() as Array<{ _id: unknown }>;

  return withCors(req, NextResponse.json({
    messages: messages.map((m) => ({
      id: String(m._id),
      content: m.content || '',
      sentBy: 'human',
      createdAt: m.createdAt,
      attachments: Array.isArray(m.attachments) ? m.attachments : [],
    })),
    deletedIds: deletedDocs.map((d) => String(d._id)),
    resolved,
    humanMode,
    // Hora del servidor: el cliente la usa como cursor del siguiente poll
    // para evitar drift de reloj del navegador.
    now: new Date().toISOString(),
  }));
}
