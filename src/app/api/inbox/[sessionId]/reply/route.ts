/**
 * POST /api/inbox/[sessionId]/reply
 * El agente humano responde al visitante desde el inbox del dashboard.
 * Crea un WidgetMessage { sentBy: 'human' } visible en el widget vía polling.
 *
 * Fase 2 (WhatsApp): el webhook entrante de WA también llamará este endpoint —
 * el widget no distingue el canal, solo ve sentBy: 'human'.
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession, Widget, WidgetMessage } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

type Params = { params: Promise<{ sessionId: string }> };

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function POST(req: NextRequest, { params }: Params) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { sessionId } = await params;
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'El mensaje no puede estar vacío.' }, { status: 400 });

  await connectDB();

  // Verificar que la sesión escalada pertenece a un widget del usuario.
  const session = await ConversationSession.findOne({ sessionId, escalated: true }).lean() as {
    widgetId?: string;
    chatSessionId?: string;
    inboxStatus?: string;
  } | null;
  if (!session) return NextResponse.json({ error: 'Sesión no encontrada o no escalada.' }, { status: 404 });

  // El widgetId en ConversationSession puede ser el _id del widget.
  const widgetId = String(session.widgetId || '');
  if (!widgetId) return NextResponse.json({ error: 'Sesión sin widget asociado.' }, { status: 400 });

  const widget = await Widget.findById(widgetId).select({ userId: 1 }).lean() as { userId?: unknown } | null;
  if (!widget || String(widget.userId) !== String(userId)) {
    return NextResponse.json({ error: 'No autorizado para esta sesión.' }, { status: 403 });
  }

  const now = new Date();
  const chatSessionId = session.chatSessionId || sessionId;

  // Insertar mensaje del agente humano en la transcripción del widget.
  await WidgetMessage.create({
    widgetId,
    userId,
    agentId: '',
    sessionId: chatSessionId,
    role: 'assistant',
    sentBy: 'human',
    content: message,
    traceId: `human:${Date.now()}`,
  });

  // Activar modo humano y registrar timestamps.
  await ConversationSession.updateOne(
    { sessionId },
    [
      {
        $set: {
          lastHumanMessageAt: now,
          humanMode: true,
          // humanModeAt: solo primera vez (si aún es null).
          humanModeAt: {
            $ifNull: ['$humanModeAt', now],
          },
        },
      },
    ],
  );

  return NextResponse.json({ ok: true });
}
