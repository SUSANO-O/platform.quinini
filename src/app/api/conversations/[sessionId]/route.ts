/**
 * GET   /api/conversations/[sessionId] — transcript de la sesión
 * PATCH /api/conversations/[sessionId] — cerrar sesión (set endedAt)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession, WidgetMessage, Widget } from '@/lib/db/models';
import { inboxTranscriptSessionId } from '@/lib/inbox-handoff';
import { verifySessionToken } from '@/lib/auth';

type Params = { params: Promise<{ sessionId: string }> };

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest, { params }: Params) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { sessionId } = await params;
  await connectDB();

  const session = await ConversationSession.findOne({ sessionId, userId }).lean();
  if (!session) return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 });

  const widget = session.widgetId
    ? await Widget.findById(session.widgetId).select({ name: 1 }).lean()
    : null;

  const transcriptId = inboxTranscriptSessionId(session as { sessionId: string; chatSessionId?: string | null });
  const messages = await WidgetMessage.find({ sessionId: transcriptId, userId, deleted: { $ne: true } })
    .sort({ createdAt: 1 })
    .select({ role: 1, sentBy: 1, content: 1, createdAt: 1, attachments: 1 })
    .limit(300)
    .lean();

  const name = (session.handoffContact as { name?: string } | null)?.name?.trim() || '';
  const phone = (session.handoffContact as { phone?: string } | null)?.phone?.trim() || '';
  const visitorLabel = name || phone || (session.visitorId ? `Visitante ${String(session.visitorId).slice(-6)}` : `Sesión ${String(session.sessionId).slice(-6)}`);

  return NextResponse.json({
    session: {
      sessionId: session.sessionId,
      widgetId: session.widgetId,
      widgetName: (widget as { name?: string } | null)?.name || String(session.widgetId || ''),
      agentId: session.agentId || '',
      visitorLabel,
      startedAt: session.startedAt,
      endedAt: session.endedAt ? new Date(session.endedAt as Date).toISOString() : null,
      escalated: Boolean(session.escalated),
      humanMode: Boolean(session.humanMode),
    },
    messages: messages.map((m) => ({
      id: String(m._id),
      role: m.role,
      sentBy: m.sentBy || 'ai',
      content: m.content,
      createdAt: m.createdAt,
      attachments: Array.isArray(m.attachments) ? m.attachments : [],
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { sessionId } = await params;
  const body = await req.json().catch(() => ({})) as { action?: string };

  if (body.action !== 'close') {
    return NextResponse.json({ error: 'Acción no válida. Usa action: "close".' }, { status: 400 });
  }

  await connectDB();
  const session = await ConversationSession.findOne({ sessionId, userId });
  if (!session) return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 });

  if (session.endedAt) {
    return NextResponse.json({ ok: true, alreadyClosed: true });
  }

  const now = new Date();
  const startedAt = session.startedAt ? new Date(session.startedAt as Date) : now;
  const durationSec = Math.round((now.getTime() - startedAt.getTime()) / 1000);

  await ConversationSession.updateOne(
    { sessionId, userId },
    { $set: { endedAt: now, durationSec } },
  );

  return NextResponse.json({ ok: true, endedAt: now.toISOString(), durationSec });
}
