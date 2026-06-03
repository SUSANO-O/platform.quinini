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
import { ConversationSession, Widget, WidgetMessage, ClientAgent } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { sendWhatsAppText, type WhatsAppAgentConfig } from '@/lib/whatsapp';

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

  // Adjuntos: validados desde la metadata que devolvió /attachment (url + publicId).
  const VALID_TYPES = ['image', 'video', 'file'];
  const VALID_RT = ['image', 'video', 'raw'];
  const attachments = Array.isArray(body?.attachments)
    ? (body.attachments as Array<Record<string, unknown>>)
        .filter((a) => a && typeof a.url === 'string' && /^https?:\/\//.test(a.url as string))
        .slice(0, 10)
        .map((a) => ({
          type: VALID_TYPES.includes(String(a.type)) ? String(a.type) : 'file',
          url: String(a.url),
          publicId: typeof a.publicId === 'string' ? a.publicId : '',
          resourceType: VALID_RT.includes(String(a.resourceType)) ? String(a.resourceType) : 'raw',
          name: typeof a.name === 'string' ? a.name.slice(0, 200) : '',
          mime: typeof a.mime === 'string' ? a.mime.slice(0, 120) : '',
          bytes: typeof a.bytes === 'number' && a.bytes >= 0 ? a.bytes : 0,
          width: typeof a.width === 'number' && a.width >= 0 ? a.width : 0,
          height: typeof a.height === 'number' && a.height >= 0 ? a.height : 0,
        }))
    : [];

  if (!message && attachments.length === 0) {
    return NextResponse.json({ error: 'El mensaje no puede estar vacío.' }, { status: 400 });
  }

  await connectDB();

  // ── Sesiones WhatsApp (wa:phoneNumberId:from) ────────────────────────────────
  if (sessionId.startsWith('wa:')) {
    const parts = sessionId.split(':');
    const phoneNumberId = parts[1] || '';
    const toPhone = parts[2] || '';
    if (!phoneNumberId || !toPhone) {
      return NextResponse.json({ error: 'sessionId de WhatsApp inválido.' }, { status: 400 });
    }

    const agentDoc = await ClientAgent.findOne({
      'whatsapp.phoneNumberId': phoneNumberId,
      userId,
    }).select({ whatsapp: 1, _id: 1 }).lean() as { whatsapp?: WhatsAppAgentConfig; _id: unknown } | null;

    if (!agentDoc) {
      return NextResponse.json({ error: 'No autorizado para este número de WhatsApp.' }, { status: 403 });
    }

    if (message) {
      const sendResult = await sendWhatsAppText(agentDoc.whatsapp ?? {}, toPhone, message);
      if (!sendResult.ok) {
        return NextResponse.json({ error: `Error al enviar por WhatsApp: ${sendResult.error}` }, { status: 502 });
      }
    }

    const created = await WidgetMessage.create({
      widgetId: String(agentDoc._id),
      userId,
      agentId: '',
      sessionId,
      role: 'assistant',
      sentBy: 'human',
      content: message,
      attachments,
      traceId: `human:${Date.now()}`,
    });

    // Actualizar timestamp de último mensaje humano en la sesión
    await ConversationSession.updateOne(
      { sessionId },
      { $set: { lastHumanMessageAt: new Date(), humanMode: true } },
    );

    return NextResponse.json({ ok: true, messageId: String(created._id), attachments, channel: 'whatsapp' });
  }

  // ── Sesiones de widget web (escaladas) ───────────────────────────────────────
  const session = await ConversationSession.findOne({ sessionId, escalated: true }).lean() as {
    widgetId?: string;
    chatSessionId?: string;
    inboxStatus?: string;
  } | null;
  if (!session) return NextResponse.json({ error: 'Sesión no encontrada o no escalada.' }, { status: 404 });

  const widgetId = String(session.widgetId || '');
  if (!widgetId) return NextResponse.json({ error: 'Sesión sin widget asociado.' }, { status: 400 });

  const widget = await Widget.findById(widgetId).select({ userId: 1 }).lean() as { userId?: unknown } | null;
  if (!widget || String(widget.userId) !== String(userId)) {
    return NextResponse.json({ error: 'No autorizado para esta sesión.' }, { status: 403 });
  }

  const now = new Date();
  const chatSessionId = session.chatSessionId || sessionId;

  // Insertar mensaje del agente humano en la transcripción del widget.
  const created = await WidgetMessage.create({
    widgetId,
    userId,
    agentId: '',
    sessionId: chatSessionId,
    role: 'assistant',
    sentBy: 'human',
    content: message,
    attachments,
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

  return NextResponse.json({ ok: true, messageId: String(created._id), attachments });
}
