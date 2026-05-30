/**
 * GET /api/inbox/[sessionId] — transcript de una sesión escalada
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession, WidgetMessage, Widget } from '@/lib/db/models';
import { inboxSessionFilter, inboxTranscriptSessionId } from '@/lib/inbox-handoff';
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

  const transcriptSessionId = inboxTranscriptSessionId(session);
  const messages = await WidgetMessage.find({ sessionId: transcriptSessionId, userId, deleted: { $ne: true } })
    .sort({ createdAt: 1 })
    .select({ role: 1, sentBy: 1, content: 1, createdAt: 1, attachments: 1 })
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
      id: (m as { _id?: unknown })._id ? String((m as { _id?: unknown })._id) : '',
      role: m.role,
      sentBy: (m as { sentBy?: string }).sentBy || 'ai',
      content: m.content,
      createdAt: m.createdAt,
      attachments: Array.isArray(m.attachments)
        ? m.attachments.map((a: { type?: string; url?: string; name?: string; mime?: string; bytes?: number; width?: number; height?: number; ocrText?: string }) => ({
            type: a.type || 'image',
            url: a.url || '',
            name: a.name || '',
            mime: a.mime || '',
            bytes: typeof a.bytes === 'number' ? a.bytes : 0,
            width: typeof a.width === 'number' ? a.width : 0,
            height: typeof a.height === 'number' ? a.height : 0,
            ocrText: a.ocrText || '',
          }))
        : [],
    })),
  });
}
