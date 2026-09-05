/**
 * GET /api/conversations — lista todas las sesiones de chat del usuario
 * Query params: status=active|all, limit=50
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession, Widget, WidgetMessage } from '@/lib/db/models';
import { inboxTranscriptSessionId } from '@/lib/inbox-handoff';
import { visibleChatSessions } from '@/lib/conversations-list-view';
import { verifySessionToken } from '@/lib/auth';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status') || 'active';
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '60', 10) || 60));

  await connectDB();

  const filter: Record<string, unknown> = { userId };
  if (status === 'active') filter.endedAt = null;
  else if (status === 'ended') filter.endedAt = { $ne: null };

  // Se piden muchas mas sesiones de las que se devuelven porque la mayoria se
  // cae al filtrar las vacias: medido contra produccion (2026-09-04), 319 de
  // 400 sesiones no tenian un solo mensaje — el 80%. Pidiendo solo `limit` la
  // lista salia casi vacia.
  const sessions = await ConversationSession.find(filter)
    .sort({ startedAt: -1 })
    .limit(Math.min(500, limit * 5))
    .lean();

  const widgetIds = [...new Set(sessions.map((s) => String(s.widgetId)).filter(Boolean))];
  const widgets = widgetIds.length
    ? await Widget.find({ _id: { $in: widgetIds } }).select({ name: 1 }).lean()
    : [];
  const widgetNameById = new Map(widgets.map((w) => [String(w._id), typeof w.name === 'string' ? w.name : '']));

  const transcriptIds = [...new Set(sessions.map((s) => inboxTranscriptSessionId(s as { sessionId: string; chatSessionId?: string | null })).filter(Boolean))];

  const lastMessages = transcriptIds.length
    ? await WidgetMessage.aggregate([
        { $match: { userId, sessionId: { $in: transcriptIds }, deleted: { $ne: true } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$sessionId',
            lastContent: { $first: '$content' },
            lastRole: { $first: '$role' },
            lastSentBy: { $first: '$sentBy' },
            lastMessageAt: { $first: '$createdAt' },
            messageCount: { $sum: 1 },
          },
        },
      ])
    : [];

  type MsgAgg = { _id: string; lastContent?: string; lastRole?: string; lastSentBy?: string; lastMessageAt?: Date; messageCount?: number };
  const msgBySession = new Map((lastMessages as MsgAgg[]).map((m) => [m._id, m]));

  const todas = sessions.map((s) => {
    const transcriptId = inboxTranscriptSessionId(s as { sessionId: string; chatSessionId?: string | null });
    const msg = msgBySession.get(transcriptId);
    const name = (s.handoffContact as { name?: string } | null)?.name?.trim() || '';
    const phone = (s.handoffContact as { phone?: string } | null)?.phone?.trim() || '';
    const visitorLabel = name || phone || (s.visitorId ? `Visitante ${String(s.visitorId).slice(-6)}` : `Sesión ${String(s.sessionId).slice(-6)}`);
    return {
      sessionId: s.sessionId,
      widgetId: s.widgetId,
      widgetName: widgetNameById.get(String(s.widgetId)) || String(s.widgetId || ''),
      agentId: s.agentId || '',
      visitorLabel,
      visitorId: typeof s.visitorId === 'string' ? s.visitorId : '',
      contact: {
        name: (s.handoffContact as { name?: string } | null)?.name || '',
        email: (s.handoffContact as { email?: string } | null)?.email || '',
        phone: phone,
      },
      startedAt: s.startedAt,
      endedAt: s.endedAt ? new Date(s.endedAt as Date).toISOString() : null,
      durationSec: typeof s.durationSec === 'number' ? s.durationSec : null,
      messageCount: msg?.messageCount ?? 0,
      escalated: Boolean(s.escalated),
      humanMode: Boolean(s.humanMode),
      sentiment: typeof s.sentiment === 'string' ? s.sentiment : 'neutral',
      lastMessage: msg?.lastContent ? String(msg.lastContent).slice(0, 200) : '',
      lastRole: msg?.lastRole || '',
      lastSentBy: msg?.lastSentBy || 'ai',
      lastMessageAt: msg?.lastMessageAt ? new Date(msg.lastMessageAt).toISOString() : (s.startedAt ? new Date(s.startedAt as Date).toISOString() : null),
    };
  });

  // Fuera los chats que se abrieron y nunca se escribieron; el resto, por
  // ultima actividad y no por hora de apertura.
  const items = visibleChatSessions(todas, limit);

  // El contador tiene que contar lo MISMO que se ve. Antes contaba todas las
  // sesiones abiertas, asi que el badge decia "12 activas" y la lista mostraba
  // tres: la diferencia eran chats vacios.
  const activas = await ConversationSession.find({ userId, endedAt: null })
    .select({ sessionId: 1, chatSessionId: 1 })
    .lean();
  const idsActivos = [...new Set(
    activas
      .map((s) => inboxTranscriptSessionId(s as { sessionId: string; chatSessionId?: string | null }))
      .filter(Boolean),
  )];
  const activosConMensajes = idsActivos.length
    ? await WidgetMessage.distinct('sessionId', {
        userId,
        sessionId: { $in: idsActivos },
        deleted: { $ne: true },
      })
    : [];
  const activeCount = activosConMensajes.length;

  return NextResponse.json({ items, activeCount });
}
