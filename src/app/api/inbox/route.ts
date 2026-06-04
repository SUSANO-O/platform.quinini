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
        { $match: { userId, sessionId: { $in: transcriptIds }, deleted: { $ne: true } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$sessionId',
            lastContent: { $first: '$content' },
            lastRole: { $first: '$role' },
            lastSentBy: { $first: '$sentBy' },
            lastMessageAt: { $first: '$createdAt' },
            hasAttachments: {
              $first: {
                $gt: [{ $size: { $ifNull: ['$attachments', []] } }, 0],
              },
            },
            messageCount: { $sum: 1 },
          },
        },
      ])
    : [];
  const msgBySession = new Map(
    lastMessages.map((m: {
      _id: string;
      lastContent?: string;
      lastRole?: string;
      lastSentBy?: string;
      lastMessageAt?: Date;
      hasAttachments?: boolean;
      messageCount?: number;
    }) => [m._id, m]),
  );

  const items = sessions.map((s) => {
    const transcriptId = inboxTranscriptSessionId(s);
    const msg = msgBySession.get(transcriptId) as
      | {
          lastContent?: string;
          lastRole?: string;
          lastSentBy?: string;
          lastMessageAt?: Date;
          hasAttachments?: boolean;
          messageCount?: number;
        }
      | undefined;
    const contact = s.handoffContact as { name?: string; email?: string; phone?: string } | null;
    const agentLastSeenAt = s.agentLastSeenAt ? new Date(s.agentLastSeenAt) : null;
    const lastVisitorMessageAt = s.lastVisitorMessageAt ? new Date(s.lastVisitorMessageAt) : null;
    const hasUnread =
      s.inboxStatus !== 'resolved' &&
      (!agentLastSeenAt ||
        (lastVisitorMessageAt !== null && lastVisitorMessageAt > agentLastSeenAt));
    const lastRole = msg?.lastRole || '';
    const needsReply =
      s.inboxStatus !== 'resolved' &&
      (lastRole === 'user' || (!lastRole && Boolean(s.handoffMessage)));
    const lastMessageAt = msg?.lastMessageAt
      ? new Date(msg.lastMessageAt).toISOString()
      : s.handoffAt
        ? new Date(s.handoffAt).toISOString()
        : null;
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
      followUpAt: s.followUpAt ? new Date(s.followUpAt).toISOString() : null,
      followUpNote: typeof s.followUpNote === 'string' ? s.followUpNote : '',
      followUpNotified: Boolean(s.followUpNotified),
      visitorId: typeof s.visitorId === 'string' ? s.visitorId : '',
      humanMode: Boolean(s.humanMode),
      hasUnread,
      needsReply,
      messageCount: msg?.messageCount ?? 0,
      lastMessage: msg?.lastContent ? String(msg.lastContent).slice(0, 200) : '',
      lastRole,
      lastSentBy: msg?.lastSentBy || 'ai',
      lastMessageAt,
      lastHasAttachments: Boolean(msg?.hasAttachments),
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
    followUpAt?: string | null;
    followUpNote?: string;
    clearFollowUp?: boolean;
  };

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const inboxStatus = body.inboxStatus === 'resolved' ? 'resolved' : body.inboxStatus === 'open' ? 'open' : null;
  const hasFollowUp =
    body.followUpAt !== undefined || typeof body.followUpNote === 'string' || body.clearFollowUp === true;
  if (!sessionId || (!inboxStatus && !hasFollowUp)) {
    return NextResponse.json(
      { error: 'sessionId y inboxStatus o followUpAt/followUpNote requeridos.' },
      { status: 400 },
    );
  }

  await connectDB();
  const $set: Record<string, unknown> = {};
  if (inboxStatus) $set.inboxStatus = inboxStatus;
  if (body.clearFollowUp === true) {
    $set.followUpAt = null;
    $set.followUpNote = '';
    $set.followUpNotified = false;
  } else {
    if (body.followUpAt !== undefined) {
      const raw = body.followUpAt;
      if (raw === null || raw === '') {
        $set.followUpAt = null;
        $set.followUpNotified = false;
      } else {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) {
          $set.followUpAt = d;
          $set.followUpNotified = false;
        }
      }
    }
    if (typeof body.followUpNote === 'string') {
      $set.followUpNote = body.followUpNote.trim().slice(0, 500);
    }
  }

  const updated = await ConversationSession.findOneAndUpdate(
    { sessionId, userId, escalated: true },
    { $set },
    { new: true },
  ).lean();

  if (!updated) {
    return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    inboxStatus: updated.inboxStatus,
    followUpAt: updated.followUpAt ? new Date(updated.followUpAt).toISOString() : null,
    followUpNote: updated.followUpNote ?? '',
  });
}
