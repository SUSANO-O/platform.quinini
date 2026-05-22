/**
 * GET /api/inbox/[sessionId] — transcript de una sesión escalada
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession, WidgetMessage, Widget } from '@/lib/db/models';
import { inboxSessionFilter } from '@/lib/inbox-handoff';
import { verifySessionToken } from '@/lib/auth';

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const { sessionId } = await params;
  await connectDB();

  const session = await ConversationSession.findOne({
    sessionId,
    ...inboxSessionFilter(userId, 'all'),
  }).lean();
  if (!session) {
    return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 });
  }

  const widget = session.widgetId
    ? await Widget.findById(session.widgetId).select({ name: 1 }).lean()
    : null;

  const messages = await WidgetMessage.find({ sessionId, userId })
    .sort({ createdAt: 1 })
    .select({ role: 1, content: 1, createdAt: 1 })
    .limit(200)
    .lean();

  const handoffMessage = typeof session.handoffMessage === 'string' ? session.handoffMessage.trim() : '';
  const transcript =
    messages.length > 0
      ? messages
      : handoffMessage
        ? [{
            role: 'user',
            content: handoffMessage,
            createdAt: session.handoffAt ?? session.startedAt,
          }]
        : [];

  const contact = session.handoffContact as { name?: string; email?: string; phone?: string } | null;

  return NextResponse.json({
    session: {
      sessionId: session.sessionId,
      widgetId: session.widgetId,
      widgetName: (widget as { name?: string } | null)?.name || session.widgetId,
      agentId: session.agentId || '',
      startedAt: session.startedAt,
      handoffAt: session.handoffAt,
      inboxStatus: session.inboxStatus || 'open',
      handoffMessage: session.handoffMessage || '',
      contact: contact || {},
    },
    messages: transcript.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}
