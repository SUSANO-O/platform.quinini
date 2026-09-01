/**
 * Formulario de ticket + encuesta de deflection, por código, sin depender del LLM.
 *
 * Contexto: la skill `slack_escalation` le pide al modelo responder ÚNICAMENTE
 * con `[[OPEN_TICKET_FORM]]` cuando el usuario quiere reportar un problema y no
 * hay email en el historial — verificado en vivo contra Tribu GPS: el modelo lo
 * hace solo ~15% de las veces (compite con reglas de negocio genéricas de
 * "pedir los datos"). Esta capa intercepta por código, ANTES de llamar al LLM.
 *
 * Extraído a un módulo compartido: hasta acá vivía duplicado, casi byte a byte,
 * en /api/widget/chat y /api/widget/chat/stream — el propio código documentaba
 * DOS bugs reales encontrados en producción por culpa de esa duplicación (ver
 * historial de este archivo). La lógica de decisión vive acá una sola vez; cada
 * ruta solo decide CÓMO entregar la respuesta (JSON vs SSE).
 *
 * Dos pasos por código (ver ticket-deflection-intent.ts):
 *   1) Si el pedido es vago ("quiero levantar un ticket", sin detalle), se
 *      pregunta el problema antes de abrir el formulario.
 *   2) Con un problema concreto, si el RAG del agente tiene una fuente con
 *      buena confianza (matias-backend: ticket-deflection-check), se le
 *      muestra esa posible solución y se pregunta si le sirvió (Sí/No) antes
 *      de ofrecer el ticket — evita tickets por cosas ya documentadas.
 */
import { ClientAgent, WidgetMessage } from '@/lib/db/models';
import { logWidgetFlow } from '@/lib/debug-widget-flow';
import {
  looksLikeTicketRequest,
  shouldForceTicketForm,
  OPEN_TICKET_FORM_MARKER,
  TICKET_INTENT_PATTERNS,
} from '@/lib/ticket-form-intent';
import {
  extractRemainderAfterMatch,
  isVagueRemainder,
  interpretYesNo,
  buildAskProblemReply,
  buildDeflectionSurveyReply,
  buildDeflectionResolvedReply,
} from '@/lib/ticket-deflection-intent';
import {
  isAwaitingProblemDescription,
  setAwaitingProblemDescription,
  getPendingDeflectionSurvey,
  setPendingDeflectionSurvey,
  clearTicketDeflectionState,
} from '@/lib/ticket-deflection-state';
import { checkTicketDeflection } from '@/lib/ticket-deflection-client';

export type TicketDeflectionResult = { intercepted: true; text: string } | { intercepted: false };

export async function checkAndBuildTicketDeflectionReply(params: {
  agentId: string;
  message: string;
  sessionId: string;
  widgetId: string;
  ownerUserId: string;
  traceId: string;
  /** Prefijo de los eventos de logWidgetFlow ('chat' en no-stream, 'stream' en SSE) — mantiene los nombres de evento que ya existían para no romper filtros de logs. */
  logPrefix: 'chat' | 'stream';
}): Promise<TicketDeflectionResult> {
  const { agentId, message, sessionId, widgetId, ownerUserId, traceId, logPrefix } = params;
  const evt = (name: string) => `${logPrefix}:${name}`;

  try {
    const ticketAgentOr = [
      ...(agentId.match(/^[a-f0-9]{24}$/i) ? [{ _id: agentId }] : []),
      { agentHubId: agentId },
    ];
    const ticketAgentDoc = (await ClientAgent.findOne({ $or: ticketAgentOr })
      .select({ enabledMcpToolIds: 1, agentHubId: 1 })
      .lean()) as { enabledMcpToolIds?: string[]; agentHubId?: string } | null;

    const hasTicketCapability = Array.isArray(ticketAgentDoc?.enabledMcpToolIds)
      && ticketAgentDoc.enabledMcpToolIds.some((t) => t.includes('_create_ticket'));
    // El RAG (matias-backend) indexa los vectores por agentHubId, no por el
    // _id de landing — sin esto, checkTicketDeflection() nunca encuentra los
    // chunks del agente cuando `agentId` llega como ObjectId (bug real,
    // encontrado probando en vivo).
    const ragAgentId = ticketAgentDoc?.agentHubId || agentId;
    const sessionKeyReady = Boolean(hasTicketCapability && ownerUserId && widgetId && sessionId);

    const pendingSurvey = sessionKeyReady
      ? await getPendingDeflectionSurvey(widgetId, sessionId, ownerUserId)
      : null;

    if (pendingSurvey) {
      // Turno anterior le mostramos la encuesta "¿esto te sirvió?" — este
      // mensaje debería ser la respuesta.
      const answer = interpretYesNo(message);
      if (answer === 'yes' || answer === 'no') {
        await clearTicketDeflectionState(widgetId, sessionId, ownerUserId);
        logWidgetFlow('🎫', evt('deflectionSurveyAnswer'), `encuesta respondida: ${answer}`, { traceId, agentId });
        return { intercepted: true, text: answer === 'yes' ? buildDeflectionResolvedReply() : OPEN_TICKET_FORM_MARKER };
      }
      // Ambigua (cambió de tema, no contestó sí/no): se limpia el estado para
      // no quedar pegado y este mensaje sigue el flujo normal de siempre.
      await clearTicketDeflectionState(widgetId, sessionId, ownerUserId);
      return { intercepted: false };
    }

    if (sessionKeyReady && (await isAwaitingProblemDescription(widgetId, sessionId, ownerUserId))) {
      // Turno anterior le preguntamos "¿cuál es el problema?" — este mensaje
      // debería describirlo.
      await clearTicketDeflectionState(widgetId, sessionId, ownerUserId);
      const deflection = await checkTicketDeflection({ agentId: ragAgentId, query: message });
      logWidgetFlow('🎫', evt('deflectionCheck'), `problema descrito, confident=${deflection.confident}`, { traceId, agentId });
      if (deflection.confident) {
        await setPendingDeflectionSurvey(widgetId, sessionId, ownerUserId, { sourceText: deflection.sourceText });
        return { intercepted: true, text: buildDeflectionSurveyReply(deflection.sourceText) };
      }
      return { intercepted: true, text: OPEN_TICKET_FORM_MARKER };
    }

    if (looksLikeTicketRequest(message)) {
      const priorUserMsgs = sessionId
        ? ((await WidgetMessage.find({ sessionId, role: 'user' })
            .select({ content: 1 })
            .limit(80)
            .lean()) as { content?: string }[])
        : [];

      const shouldProceed = shouldForceTicketForm({
        message,
        history: priorUserMsgs.map((m) => ({ role: 'user', content: m.content })),
        hasTicketCapability,
      });

      if (shouldProceed) {
        const remainder = extractRemainderAfterMatch(message, TICKET_INTENT_PATTERNS);
        if (isVagueRemainder(remainder)) {
          logWidgetFlow('🎫', evt('ticketVague'), 'pedido de ticket vago — se pregunta el problema', { traceId, agentId });
          if (sessionKeyReady) await setAwaitingProblemDescription(widgetId, sessionId, ownerUserId);
          return { intercepted: true, text: buildAskProblemReply() };
        }

        const deflection = await checkTicketDeflection({ agentId: ragAgentId, query: message });
        logWidgetFlow('🎫', evt('forceTicketForm'), `detección por código, confident=${deflection.confident}`, { traceId, agentId });
        if (deflection.confident) {
          if (sessionKeyReady) {
            await setPendingDeflectionSurvey(widgetId, sessionId, ownerUserId, { sourceText: deflection.sourceText });
          }
          return { intercepted: true, text: buildDeflectionSurveyReply(deflection.sourceText) };
        }
        return { intercepted: true, text: OPEN_TICKET_FORM_MARKER };
      }
    }

    return { intercepted: false };
  } catch (err) {
    // Fail-open: si este chequeo falla, seguimos con el flujo normal (el LLM
    // sigue teniendo su propia chance de emitir el marcador).
    logWidgetFlow('⚠️', evt('forceTicketFormErr'), 'chequeo de ticket-form falló, sigue flujo normal', {
      traceId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { intercepted: false };
  }
}
