/**
 * GET  /api/inbox — sesiones escaladas del usuario
 * PATCH /api/inbox — marcar sesión como resuelta (body: { sessionId, inboxStatus })
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession, Widget, WidgetMessage } from '@/lib/db/models';
import { inboxSessionFilter, inboxTranscriptSessionId } from '@/lib/inbox-handoff';
import { verifySessionToken } from '@/lib/auth';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status') || 'open';
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10) || 50));

  await connectDB();

  const filter = inboxSessionFilter(userId, status === 'resolved' ? 'resolved' : 'open');

  const sessions = await ConversationSession.find(filter)
    .sort({ handoffAt: -1, startedAt: -1 })
    .limit(limit)
    .lean();

  const widgetIds = [...new Set(sessions.map((s) => String(s.widgetId)).filter(Boolean))];
  const widgets = widgetIds.length
    ? await Widget.find({ _id: { $in: widgetIds } }).select({ name: 1 }).lean()
    : [];
  const widgetNameById = new Map(widgets.map((w) => [String(w._id), typeof w.name === 'string' ? w.name : '']));

  const transcriptIds = [
    ...new Set(
      sessions
        .map((s) => inboxTranscriptSessionId(s))
        .filter(Boolean),
    ),
  ];
  const lastMessages = transcriptIds.length
    ? await WidgetMessage.aggregate([
        { $match: { userId, sessionId: { $in: transcriptIds } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$sessionId',
            lastContent: { $first: '$content' },
            lastRole: { $first: '$role' },
            messageCount: { $sum: 1 },
          },
        },
      ])
    : [];
  const msgBySession = new Map(
    lastMessages.map((m: { _id: string; lastContent?: string; lastRole?: string; messageCount?: number }) => [
      m._id,
      m,
    ]),
  );

  const items = sessions.map((s) => {
    const transcriptId = inboxTranscriptSessionId(s);
    const msg = msgBySession.get(transcriptId) as
      | { lastContent?: string; lastRole?: string; messageCount?: number }
      | undefined;
    const contact = s.handoffContact as { name?: string; email?: string; phone?: string } | null;
    return {
      sessionId: s.sessionId,
      widgetId: s.widgetId,
      widgetName: widgetNameById.get(String(s.widgetId)) || s.widgetId,
      agentId: s.agentId || '',
      startedAt: s.startedAt,
      handoffAt: s.handoffAt || s.updatedAt,
      inboxStatus: s.inboxStatus || 'open',
      contact: contact || {},
      handoffMessage: s.handoffMessage || '',
      messageCount: msg?.messageCount ?? 0,
      lastMessage: msg?.lastContent ? String(msg.lastContent).slice(0, 200) : '',
      lastRole: msg?.lastRole || '',
    };
  });

  const openCount = await ConversationSession.countDocuments(
    inboxSessionFilter(userId, 'open'),
  );

  return NextResponse.json({ items, openCount });
}

export async function PATCH(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    sessionId?: string;
    inboxStatus?: 'open' | 'resolved';
  };

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const inboxStatus = body.inboxStatus === 'resolved' ? 'resolved' : body.inboxStatus === 'open' ? 'open' : null;
  if (!sessionId || !inboxStatus) {
    return NextResponse.json({ error: 'sessionId e inboxStatus (open|resolved) requeridos.' }, { status: 400 });
  }

  await connectDB();
  const updated = await ConversationSession.findOneAndUpdate(
    { sessionId, userId, escalated: true },
    { $set: { inboxStatus } },
    { new: true },
  ).lean();

  if (!updated) {
    return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, sessionId, inboxStatus });
}
