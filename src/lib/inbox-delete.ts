import {
  ConversationSession,
  Widget,
  WidgetFeedback,
  WidgetMessage,
  WidgetSessionContext,
} from '@/lib/db/models';
import { deleteCloudinaryAsset, type CloudinaryResourceType } from '@/lib/cloudinary';
import { inboxSessionFilter, inboxTranscriptSessionId } from '@/lib/inbox-handoff';

type MessageAttachment = {
  publicId?: string;
  resourceType?: string;
};

type InboxSessionRow = {
  widgetId?: string;
  chatSessionId?: string;
};

type WidgetMessageRow = {
  attachments?: MessageAttachment[];
};

export type InboxDeleteResult = {
  ok: boolean;
  error?: string;
  messagesDeleted?: number;
  sessionsDeleted?: number;
};

async function deleteAttachmentsFromCloudinary(atts: MessageAttachment[]): Promise<void> {
  const tasks = atts
    .filter((att): att is MessageAttachment & { publicId: string } => Boolean(att?.publicId))
    .map((att) =>
      deleteCloudinaryAsset(String(att.publicId), (att.resourceType as CloudinaryResourceType) || 'image'),
    );
  await Promise.all(tasks);
}

/** Elimina una entrada del inbox y, si aplica, el transcript y datos relacionados. */
export async function deleteInboxSessionForUser(
  userId: string,
  sessionId: string,
): Promise<InboxDeleteResult> {
  const uid = String(userId).trim();
  const sid = String(sessionId).trim();
  if (!uid || !sid) return { ok: false, error: 'Parámetros inválidos.' };

  const session = await ConversationSession.findOne({
    sessionId: sid,
    ...inboxSessionFilter(uid, 'all'),
  }).lean() as InboxSessionRow | null;

  if (!session) return { ok: false, error: 'Sesión no encontrada.' };

  const widgetId = String(session.widgetId || '');
  const widget = await Widget.findById(widgetId).select({ userId: 1 }).lean() as { userId?: unknown } | null;
  if (!widget || String(widget.userId) !== uid) {
    return { ok: false, error: 'No autorizado para esta sesión.' };
  }

  const chatSessionId = inboxTranscriptSessionId({
    sessionId: sid,
    chatSessionId: session.chatSessionId,
  });
  let messagesDeleted = 0;

  if (chatSessionId) {
    const messages = await WidgetMessage.find({ sessionId: chatSessionId, userId: uid }).lean() as WidgetMessageRow[];
    messagesDeleted = messages.length;

    await Promise.all(
      messages.map((msg) => deleteAttachmentsFromCloudinary(Array.isArray(msg.attachments) ? msg.attachments : [])),
    );

    await WidgetMessage.deleteMany({ sessionId: chatSessionId, userId: uid });
    await WidgetFeedback.deleteMany({ sessionId: chatSessionId, userId: uid });
    await WidgetSessionContext.deleteMany({ chatSessionId, userId: uid, widgetId });
  }

  const sessionDelete = await ConversationSession.deleteMany({
    userId: uid,
    $or: [
      { sessionId: sid },
      ...(chatSessionId
        ? [
            { sessionId: chatSessionId },
            { chatSessionId, escalated: true },
          ]
        : []),
    ],
  });

  return {
    ok: true,
    messagesDeleted,
    sessionsDeleted: sessionDelete.deletedCount ?? 0,
  };
}
