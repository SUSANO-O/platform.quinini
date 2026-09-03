/**
 * GET /api/conversations — lista todas las sesiones de chat del usuario
 * Query params: status=active|all, limit=50
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession, Widget, WidgetMessage } from '@/lib/db/models';
import { inboxTranscriptSessionId } from '@/lib/inbox-handoff';
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

  // Ocultar los "chats" que solo se abrieron y nunca tuvieron actividad real.
  // (Antes se creaba un ConversationSession vacío al abrir el panel; ese evento
  // ahora vive en WidgetLoadEvent / pestaña "Cargas".) Se mantienen las sesiones
  // con mensajes, escaladas, en modo humano, en inbox o con mensaje del visitante.
  filter.$or = [
    { messageCount: { $gt: 0 } },
    { escalated: true },
    { humanMode: true },
    { inboxStatus: { $ne: null } },
    { lastVisitorMessageAt: { $ne: null } },
  ];

  const sessions = await ConversationSession.find(filter)
    .sort({ startedAt: -1 })
    .limit(limit)
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

  const items = sessions.map((s) => {
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

  const activeCount = await ConversationSession.countDocuments({
    userId,
    endedAt: null,
    $or: [
      { messageCount: { $gt: 0 } },
      { escalated: true },
      { humanMode: true },
      { inboxStatus: { $ne: null } },
      { lastVisitorMessageAt: { $ne: null } },
    ],
  });

  return NextResponse.json({ items, activeCount });
}
