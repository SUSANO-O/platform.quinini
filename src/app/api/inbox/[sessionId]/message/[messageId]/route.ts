/**
 * DELETE /api/inbox/[sessionId]/message/[messageId]
 * El agente retira un mensaje que envió (texto y/o adjuntos). Borra los assets de
 * Cloudinary y marca el mensaje como `deleted` — el widget lo elimina vía polling.
 *
 * Auth: sesión del dueño del widget (cookie afhub_session).
 */
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { ConversationSession, Widget, WidgetMessage } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { deleteCloudinaryAsset, type CloudinaryResourceType } from '@/lib/cloudinary';

type Params = { params: Promise<{ sessionId: string; messageId: string }> };

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { sessionId, messageId } = await params;
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    return NextResponse.json({ error: 'ID de mensaje inválido.' }, { status: 400 });
  }

  await connectDB();

  const session = await ConversationSession.findOne({ sessionId }).lean() as {
    widgetId?: string;
    chatSessionId?: string;
  } | null;
  if (!session) return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 });

  const widgetId = String(session.widgetId || '');
  const widget = await Widget.findById(widgetId).select({ userId: 1 }).lean() as { userId?: unknown } | null;
  if (!widget || String(widget.userId) !== String(userId)) {
    return NextResponse.json({ error: 'No autorizado para esta sesión.' }, { status: 403 });
  }

  // El mensaje debe ser del agente humano, de este widget, y no ya borrado.
  const msg = await WidgetMessage.findOne({
    _id: messageId,
    widgetId,
    sessionId: session.chatSessionId || sessionId,
    sentBy: 'human',
  }).lean() as {
    _id: unknown;
    attachments?: Array<{ publicId?: string; resourceType?: string }>;
  } | null;
  if (!msg) return NextResponse.json({ error: 'Mensaje no encontrado.' }, { status: 404 });

  // Borrar los assets de Cloudinary (best-effort, idempotente).
  const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
  await Promise.all(
    atts
      .filter((a) => a && a.publicId)
      .map((a) =>
        deleteCloudinaryAsset(String(a.publicId), (a.resourceType as CloudinaryResourceType) || 'image'),
      ),
  );

  await WidgetMessage.updateOne(
    { _id: messageId },
    { $set: { deleted: true, content: '', attachments: [] } },
  );

  return NextResponse.json({ ok: true, messageId });
}
