/**
 * Cierre de conversaciones del Inbox (web + WhatsApp).
 * Al marcar como resuelta: desactiva modo humano, registra fin y envía despedida o encuesta.
 */
import { ConversationSession, Widget, WidgetMessage, WidgetFeedback, ClientAgent } from '@/lib/db/models';
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
  _id?: unknown;
  agentId?: string;
  feedbackEnabled?: boolean;
  feedbackTitle?: string;
  feedbackThanks?: string;
  feedbackQuestions?: FeedbackQuestion[];
};

export function hasEnabledFeedbackQuestions(widget: WidgetCloseConfig | null): boolean {
  if (!widget || widget.feedbackEnabled !== true) return false;
  return (widget.feedbackQuestions ?? []).some(
    (q) => q && q.enabled !== false && typeof q.text === 'string' && q.text.trim(),
  );
}

export function buildInboxClosingMessage(widget: WidgetCloseConfig | null): string {
  const farewell = 'La conversación ha finalizado. Gracias por contactarnos.';
  if (!hasEnabledFeedbackQuestions(widget)) {
    return `${farewell} ¿Puedo ayudarte en algo más?`;
  }

  const enabledQs = (widget!.feedbackQuestions ?? []).filter(
    (q) => q && q.enabled !== false && typeof q.text === 'string' && q.text.trim(),
  );
  const title = (widget!.feedbackTitle || '¿Cómo fue tu experiencia?').trim();
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

async function loadWidgetForSession(session: {
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
    agentId: 1,
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

function isFeedbackDismissText(text: string): boolean {
  const n = text.trim().toLowerCase()
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n');
  return /^(omitir|skip|ahora no|no gracias|paso|luego)$/.test(n);
}

function parseWaFeedbackFromText(
  text: string,
  questions: FeedbackQuestion[],
): { answers: Array<{ questionId: string; questionText: string; type: string; value: unknown }>; score: number | null } {
  const enabledQs = questions.filter(
    (q) => q && q.enabled !== false && q.id && typeof q.text === 'string' && q.text.trim(),
  );
  const answers: Array<{ questionId: string; questionText: string; type: string; value: unknown }> = [];
  const ratings: number[] = [];
  const t = text.trim();

  const ratingOnly = /^([1-5])$/.exec(t);
  if (ratingOnly) {
    const q = enabledQs.find((row) => row.type === 'rating') || enabledQs[0];
    if (q?.id) {
      const n = parseInt(ratingOnly[1], 10);
      answers.push({ questionId: q.id, questionText: q.text!.trim(), type: 'rating', value: n });
      ratings.push(n);
    }
  } else if (/^(si|sí|yes|no)$/i.test(t)) {
    const q = enabledQs.find((row) => row.type === 'yesno') || enabledQs[0];
    if (q?.id) {
      const val = /^(si|sí|yes)$/i.test(t) ? 'Sí' : 'No';
      answers.push({ questionId: q.id, questionText: q.text!.trim(), type: 'yesno', value: val });
    }
  } else {
    const q = enabledQs.find((row) => row.type === 'text') || enabledQs[0];
    if (q?.id) {
      answers.push({
        questionId: q.id,
        questionText: q.text!.trim(),
        type: q.type === 'text' ? 'text' : 'text',
        value: t.slice(0, 2000),
      });
    }
  }

  const score = ratings.length
    ? Math.round((ratings.reduce((s, n) => s + n, 0) / ratings.length) * 10) / 10
    : null;
  return { answers, score };
}

async function persistAssistantMessage(input: {
  session: { sessionId: string; chatSessionId?: string | null; widgetId?: string; userId: string; agentId?: string };
  content: string;
  sentBy: 'human' | 'ai';
  traceId?: string;
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
    traceId: input.traceId || `resolve:${Date.now()}`,
  });
}

/** Reabre una sesión WA resuelta para iniciar conversación nueva con el bot. */
export async function reopenWhatsAppSession(sessionId: string): Promise<void> {
  const now = new Date();
  await ConversationSession.updateOne(
    { sessionId },
    {
      $set: {
        inboxStatus: 'open',
        waFeedbackPending: false,
        humanMode: false,
        endedAt: null,
        durationSec: null,
        startedAt: now,
        handoffAt: now,
        lastVisitorMessageAt: now,
        escalated: true,
        updatedAt: now,
      },
    },
  );
}

/**
 * Mensaje entrante en sesión WA ya resuelta.
 * - Encuesta pendiente → agradece y cierra el ciclo de feedback.
 * - Si no hay encuesta pendiente → reabre y deja que el webhook procese como chat nuevo.
 */
export async function handleWhatsAppResolvedInbound(params: {
  sessionId: string;
  ownerUserId: string;
  agentIdForChat: string;
  widgetIdEquivalent: string;
  waConfig: WhatsAppAgentConfig;
  from: string;
  text: string;
  waFeedbackPending?: boolean;
}): Promise<'feedback_handled' | 'reopen_for_new_chat'> {
  const sessionRow = {
    sessionId: params.sessionId,
    chatSessionId: params.sessionId,
    widgetId: params.widgetIdEquivalent,
    userId: params.ownerUserId,
    agentId: params.agentIdForChat,
  };

  if (params.waFeedbackPending) {
    const widget = await loadWidgetForSession(sessionRow);
    const thanks = (widget?.feedbackThanks || '¡Gracias por tu respuesta!').trim();
    const dismiss = isFeedbackDismissText(params.text);

    if (!dismiss && widget && hasEnabledFeedbackQuestions(widget)) {
      const widgetDbId = widget._id ? String(widget._id) : '';
      const existing = widgetDbId
        ? await WidgetFeedback.exists({ sessionId: params.sessionId, widgetId: widgetDbId })
        : null;
      if (!existing && widgetDbId) {
        const { answers, score } = parseWaFeedbackFromText(params.text, widget.feedbackQuestions ?? []);
        if (answers.length) {
          await WidgetFeedback.create({
            widgetId: widgetDbId,
            userId: params.ownerUserId,
            agentId: widget.agentId ? String(widget.agentId) : params.agentIdForChat,
            sessionId: params.sessionId,
            visitorId: `wa_${params.from}`,
            score,
            answers,
          });
          if (score != null) {
            await ConversationSession.updateOne(
              { sessionId: params.sessionId },
              { $set: { satisfactionScore: score, resolved: score >= 4 } },
            );
          }
        }
      }
    }

    await ConversationSession.updateOne(
      { sessionId: params.sessionId },
      { $set: { waFeedbackPending: false, updatedAt: new Date() } },
    );

    await sendWhatsAppText(params.waConfig, params.from, thanks);
    await persistAssistantMessage({
      session: sessionRow,
      content: thanks,
      sentBy: 'human',
      traceId: `feedback-thanks:${Date.now()}`,
    });

    return 'feedback_handled';
  }

  return 'reopen_for_new_chat';
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

  const widgetConfig = await loadWidgetForSession(session);
  const closingText = buildInboxClosingMessage(widgetConfig);
  const surveyPending = hasEnabledFeedbackQuestions(widgetConfig);

  const waParts = parseWhatsAppSessionId(session.sessionId);
  if (waParts) {
    const agentDoc = await ClientAgent.findOne({
      userId,
      'whatsapp.phoneNumberId': waParts.phoneNumberId,
    })
      .select({ whatsapp: 1, _id: 1 })
      .lean() as { whatsapp?: WhatsAppAgentConfig; _id: unknown } | null;

    if (!agentDoc?.whatsapp?.phoneNumberId) {
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
          waFeedbackPending: surveyPending,
          endedAt: now,
          durationSec,
          updatedAt: now,
        },
      },
    );

    await persistAssistantMessage({
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
        waFeedbackPending: false,
        endedAt: now,
        durationSec,
        updatedAt: now,
      },
    },
  );

  return { ok: true, channel: 'web', messageSent: false, closingText };
}
