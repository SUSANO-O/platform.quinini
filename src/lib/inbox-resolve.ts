/**
 * Cierre de conversaciones del Inbox (web + WhatsApp).
 * Al marcar como resuelta: desactiva modo humano, registra fin y envía despedida o encuesta.
 */
import { ConversationSession, Widget, WidgetMessage, ClientAgent } from '@/lib/db/models';
import { sendWhatsAppText, type WhatsAppAgentConfig } from '@/lib/whatsapp';
import { inboxTranscriptSessionId } from '@/lib/inbox-handoff';

type FeedbackQuestion = {
  id?: string;
  text?: string;
  type?: string;
  options?: string[];
  enabled?: boolean;
};

type WidgetCloseConfig = {
  feedbackEnabled?: boolean;
  feedbackTitle?: string;
  feedbackThanks?: string;
  feedbackQuestions?: FeedbackQuestion[];
};

export function buildInboxClosingMessage(widget: WidgetCloseConfig | null): string {
  const farewell = 'La conversación ha finalizado. Gracias por contactarnos.';
  if (!widget || widget.feedbackEnabled !== true) {
    return `${farewell} ¿Puedo ayudarte en algo más?`;
  }

  const enabledQs = (widget.feedbackQuestions ?? []).filter(
    (q) => q && q.enabled !== false && typeof q.text === 'string' && q.text.trim(),
  );
  if (!enabledQs.length) {
    return `${farewell} ¿Puedo ayudarte en algo más?`;
  }

  const title = (widget.feedbackTitle || '¿Cómo fue tu experiencia?').trim();
  const lines = [`${farewell}`, '', title];
  enabledQs.forEach((q, i) => {
    let line = `${i + 1}. ${String(q.text).trim()}`;
    if (q.type === 'rating') line += ' (responde del 1 al 5)';
    else if (q.type === 'yesno') line += ' (responde sí o no)';
    else if (q.type === 'choice' && Array.isArray(q.options) && q.options.length) {
      line += ` (${q.options.join(' / ')})`;
    }
    lines.push(line);
  });
  lines.push('', 'Responde en un solo mensaje. Escribe "omitir" si prefieres no participar.');
  return lines.join('\n').slice(0, 4096);
}

async function loadWidgetCloseConfig(session: {
  widgetId?: string;
  agentId?: string;
  userId: string;
}): Promise<WidgetCloseConfig | null> {
  const userId = String(session.userId || '').trim();
  const widgetId = String(session.widgetId || '').trim();
  const agentId = String(session.agentId || '').trim();

  const select = {
    feedbackEnabled: 1,
    feedbackTitle: 1,
    feedbackThanks: 1,
    feedbackQuestions: 1,
    name: 1,
  } as const;

  if (widgetId) {
    const byId = await Widget.findById(widgetId).select(select).lean() as WidgetCloseConfig | null;
    if (byId) return byId;
    const byAgent = await Widget.findOne({ userId, agentId: widgetId }).select(select).lean() as WidgetCloseConfig | null;
    if (byAgent) return byAgent;
  }
  if (agentId) {
    const byAgent = await Widget.findOne({ userId, agentId }).select(select).lean() as WidgetCloseConfig | null;
    if (byAgent) return byAgent;
  }
  return null;
}

function parseWhatsAppSessionId(sessionId: string): { phoneNumberId: string; toPhone: string } | null {
  if (!sessionId.startsWith('wa:')) return null;
  const parts = sessionId.split(':');
  const phoneNumberId = parts[1]?.trim() || '';
  const toPhone = parts[2]?.trim() || '';
  if (!phoneNumberId || !toPhone) return null;
  return { phoneNumberId, toPhone };
}

async function persistClosingMessage(input: {
  session: { sessionId: string; chatSessionId?: string | null; widgetId?: string; userId: string; agentId?: string };
  content: string;
  sentBy: 'human' | 'ai';
}): Promise<void> {
  const transcriptId = inboxTranscriptSessionId(input.session);
  const widgetId = String(input.session.widgetId || '').trim();
  await WidgetMessage.create({
    widgetId: widgetId || String(input.session.agentId || ''),
    userId: input.session.userId,
    agentId: input.session.agentId || '',
    sessionId: transcriptId,
    role: 'assistant',
    sentBy: input.sentBy,
    content: input.content,
    traceId: `resolve:${Date.now()}`,
  });
}

export type ResolveInboxResult =
  | { ok: true; channel: 'whatsapp' | 'web'; messageSent: boolean; closingText: string }
  | { ok: false; error: string };

export async function resolveInboxSession(
  userId: string,
  session: {
    sessionId: string;
    chatSessionId?: string | null;
    widgetId?: string;
    agentId?: string;
    userId: string;
    startedAt?: Date;
  },
): Promise<ResolveInboxResult> {
  const now = new Date();
  const startedAt = session.startedAt ? new Date(session.startedAt) : now;
  const durationSec = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000));

  const widgetConfig = await loadWidgetCloseConfig(session);
  const closingText = buildInboxClosingMessage(widgetConfig);

  const waParts = parseWhatsAppSessionId(session.sessionId);
  if (waParts) {
    const agentDoc = await ClientAgent.findOne({
      userId,
      'whatsapp.phoneNumberId': waParts.phoneNumberId,
    })
      .select({ whatsapp: 1, _id: 1 })
      .lean() as { whatsapp?: WhatsAppAgentConfig; _id: unknown } | null;

    if (!agentDoc?.whatsapp?.enabled) {
      return { ok: false, error: 'WhatsApp no está configurado para este agente.' };
    }

    const sendResult = await sendWhatsAppText(agentDoc.whatsapp, waParts.toPhone, closingText);
    if (!sendResult.ok) {
      return { ok: false, error: sendResult.error || 'No se pudo enviar el mensaje de cierre por WhatsApp.' };
    }

    await ConversationSession.updateOne(
      { sessionId: session.sessionId, userId },
      {
        $set: {
          inboxStatus: 'resolved',
          humanMode: false,
          endedAt: now,
          durationSec,
          updatedAt: now,
        },
      },
    );

    await persistClosingMessage({
      session: { ...session, widgetId: String(agentDoc._id) },
      content: closingText,
      sentBy: 'human',
    });

    return { ok: true, channel: 'whatsapp', messageSent: true, closingText };
  }

  await ConversationSession.updateOne(
    { sessionId: session.sessionId, userId },
    {
      $set: {
        inboxStatus: 'resolved',
        humanMode: false,
        endedAt: now,
        durationSec,
        updatedAt: now,
      },
    },
  );

  // En widget web el cliente recibe la despedida/encuesta vía polling (resolved=true).
  return { ok: true, channel: 'web', messageSent: false, closingText };
}
