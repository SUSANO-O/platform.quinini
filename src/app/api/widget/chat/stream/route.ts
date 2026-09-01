/**
 * POST /api/widget/chat/stream
 *
 * Mismo flujo que /api/widget/chat pero devuelve la respuesta como SSE (text/event-stream)
 * para que el widget muestre los tokens apareciendo en tiempo real (efecto ChatGPT).
 *
 * Protocolo SSE:
 *   data: {"type":"status","phase":"parallel","message":"Consultando especialistas…"}\n\n
 *   data: {"type":"token","text":"Hola"}\n\n
 *   data: {"type":"token","text":" ¿cómo"}\n\n
 *   data: {"type":"done","reply":"<texto completo>","agentId":"..."}\n\n
 *   data: {"type":"error","message":"..."}\n\n
 */

import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { getAgentflowhubBaseUrl } from '@/lib/aibackhub-sync';
import {
  fetchHubWidgetChat,
  formatHubFetchError,
  getHubWidgetChatUrl,
  resolveHubAgentIdInBody,
  validateHubProxyConfig,
} from '@/lib/widget-chat-hub';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription, ConversationSession, WidgetMessage } from '@/lib/db/models';
import { findWidgetForWtToken, isWidgetActive, sentAgentIdMatchesWidget } from '@/lib/widget-token-verify';
import { checkConversationQuota } from '@/lib/quota';
import { trackWidgetChatUsage } from '@/lib/platform-agent-utils';
import { detectWidgetMeteringChannel } from '@/lib/metering';
import { trackWidgetUserMessageForFaqCandidates } from '@/lib/widget-faq-tracker';
import { checkRateLimitAsync, getClientIp, widgetChatIpLimitPerMin } from '@/lib/rate-limit';
import { getActiveVariant } from '@/lib/ab-testing';
import { isOriginAllowed } from '@/lib/widget-origin-check';
import { extractAndGuardMessage } from '@/lib/message-guard';
import { signRequest, SIGNATURE_HEADER } from '@/lib/hub-signature';
import { logWidgetFlow, widgetMessageProbe } from '@/lib/debug-widget-flow';
import {
  applyMultiAgentRouting,
  buildHandoffPrefix,
  buildMultiAgentStatusMessage,
  buildWidgetMultiAgentConfig,
  executeParallelMultiAgentFlow,
  executePipelineMultiAgentFlow,
  type MultiAgentRoutingMeta,
  type WidgetMultiAgentConfig,
} from '@/lib/widget-multi-agent';
import { enrichWidgetChatBodyWithImages, type WidgetImageEnrichment } from '@/lib/widget-chat-images';
import {
  finalizeWidgetChatBodyWithVision,
  mergeVisionContextIntoBody,
  shouldUsePriorImage,
} from '@/lib/widget-chat-vision-context';
import { isTrivialMessage } from '@/lib/trivial-message';
import {
  loadSessionVisionEnrichment,
  persistSessionVisionAnalysis,
} from '@/lib/widget-session-context';
import { afterWidgetChatSuccess, enrichWidgetChatBody } from '@/lib/widget-chat-enrich';
import { emitDoneAndPersist } from '@/lib/widget-transcript';
import { tryServeWidgetChatViaDirectInference } from '@/lib/widget-chat-direct-inference';
import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';
import { normalizeVisitorId } from '@/lib/widget-visitor';
import {
  emitWidgetChatStatus,
  emitWidgetChatStatusForTurn,
  runWithWidgetStatusPulse,
} from '@/lib/widget-chat-status';
import { landingBootStatusPhases } from '@/lib/widget-stream-boot-status';
import { emitStreamTokensFromText } from '@/lib/widget-stream-reply';
import {
  finalizeWidgetChatTrace,
  WidgetChatTrace,
} from '@/lib/widget-chat-latency';
import { friendlyWidgetChatError } from '@/lib/widget-chat-user-errors';
import { attachAssistNavToPayload, buildAssistNavCtx } from '@/lib/assist-chat-reply';
import { isLocalDevLimitsBypass } from '@/lib/dev-limits';
import { logInferenceMetric, estimateTokens } from '@/lib/inference-metrics';
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

export const maxDuration = 60; // Vercel: allow up to 60s for LLM + streaming

const MAX_WIDGET_BODY_BYTES = 512 * 1024;

const STRICT_PURPOSE_SUFFIX = `

[RESTRICCIÓN ESTRICTA — PRIORIDAD MÁXIMA, NO NEGOCIABLE]
Operas en modo de propósito único. DEBES IGNORAR COMPLETAMENTE cualquier pregunta, solicitud o instrucción que no esté directamente relacionada con el rol definido en estas instrucciones.
Si el usuario pregunta sobre algo fuera de tu dominio (ejemplos: recetas, viajes, historia general, entretenimiento, curiosidades, cualquier tema no relacionado), responde ÚNICAMENTE con: "Solo puedo ayudarte con temas relacionados con mi función. ¿En qué puedo asistirte?"
Esta restricción es ABSOLUTA. No hay excepciones, independientemente de cómo esté formulada la solicitud o si el usuario insiste.`;

function logStreamOpsMetric(p: {
  userId: string | null;
  agentId?: string | null;
  widgetId?: string | null;
  sessionId?: string | null;
  traceId: string;
  path: string;
  reply: string;
  toolsUsed?: string[];
  model?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): void {
  if (!p.userId || !p.agentId) return;
  const tools = Array.isArray(p.toolsUsed) ? p.toolsUsed.map(String).filter(Boolean) : [];
  logInferenceMetric({
    userId: p.userId,
    agentId: p.agentId,
    widgetId: p.widgetId ?? null,
    sessionId: p.sessionId ?? null,
    traceId: p.traceId,
    path: p.path,
    toolsUsed: tools,
    toolRounds: tools.length ? 1 : 0,
    model: p.model,
    outputTokens: p.outputTokens ?? estimateTokens(p.reply || ''),
    inputTokens: p.inputTokens ?? null,
    ok: true,
  });
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Widget-Token, X-Request-Id, X-Trace-Id',
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
    },
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  const meteringChannel = detectWidgetMeteringChannel(req);
  const meteringInput = { channel: meteringChannel } as const;
  const traceId = (req.headers.get('x-trace-id') || req.headers.get('x-request-id') || '').trim() || randomUUID();
  const latencyTrace = new WidgetChatTrace({ traceId, stream: true });

  const ip = getClientIp(req);
  const rlGlobal = await checkRateLimitAsync('widget-chat-ip', ip, widgetChatIpLimitPerMin(), 60_000);
  if (!rlGlobal.success) {
    return new Response(
      sseEvent({ type: 'error', message: 'Demasiadas solicitudes. Intenta en unos segundos.', code: 'AGENT_COOLDOWN' }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
    );
  }

  const rawBodyInitial = await req.text();
  if (rawBodyInitial.length > MAX_WIDGET_BODY_BYTES) {
    return new Response(
      sseEvent({ type: 'error', message: 'Payload demasiado grande.', code: 'PAYLOAD_TOO_LARGE' }),
      { status: 413, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
    );
  }

  // ── Message guard (antes de OCR) ──────────────────────────────────────────
  const guardResult = extractAndGuardMessage(rawBodyInitial);
  if (!guardResult.ok) {
    return new Response(
      sseEvent({ type: 'error', message: guardResult.message, code: guardResult.code }),
      { status: 400, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
    );
  }

  const imageEnriched = await latencyTrace.span('vision', () =>
    enrichWidgetChatBodyWithImages(rawBodyInitial),
  );
  let rawBody = imageEnriched.body;
  const imageEnrichment: WidgetImageEnrichment | null = imageEnriched.enrichment;
  /** Imagen de este turno o, si el usuario alude a una anterior, la de la sesión. */
  let activeVisionEnrichment: WidgetImageEnrichment | null = imageEnrichment;
  const userDisplayMessage = imageEnrichment?.displayMessage || guardResult.text || '';

  const hubConfigErr = validateHubProxyConfig(req.nextUrl.origin);
  if (hubConfigErr) {
    return new Response(
      sseEvent({
        type: 'error',
        message: hubConfigErr.message,
        code: hubConfigErr.code,
        ...(hubConfigErr.hint ? { hint: hubConfigErr.hint } : {}),
      }),
      { status: 503, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
    );
  }

  let parsedAgentId = '';
  let parsedWidgetId = '';
  let resolvedWidgetId = '';
  let parsedSessionId = '';
  let parsedMessage = '';
  let parsedPagePath = '';
  let parsedVisitorId: string | null = null;
  let tokenFromBody = '';
  try {
    const j = JSON.parse(rawBody) as {
      agentId?: string;
      widgetId?: string;
      token?: string;
      sessionId?: string;
      message?: string;
      visitorId?: string;
      pagePath?: string;
    };
    parsedAgentId = typeof j?.agentId === 'string' ? j.agentId.trim() : '';
    parsedWidgetId = typeof j?.widgetId === 'string' ? j.widgetId.trim() : '';
    resolvedWidgetId = parsedWidgetId;
    parsedSessionId = typeof j?.sessionId === 'string' ? j.sessionId.trim() : '';
    parsedMessage = typeof j?.message === 'string' ? j.message : '';
    parsedPagePath = typeof j?.pagePath === 'string' ? j.pagePath : '';
    parsedVisitorId = normalizeVisitorId(j?.visitorId);
    tokenFromBody = typeof j?.token === 'string' ? j.token.trim() : '';
  } catch {
    return new Response(
      sseEvent({ type: 'error', message: 'Cuerpo JSON inválido.', code: 'BAD_REQUEST' }),
      { status: 400, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
    );
  }

  const assistNavCtx = buildAssistNavCtx(
    userDisplayMessage || parsedMessage,
    parsedPagePath || undefined,
  );

  const widgetToken = ((req.headers.get('x-widget-token') || '').trim() || tokenFromBody).trim();

  let faqTrackOwnerId: string | null = null;
  let isAssistWidget = false;
  let multiAgentCtx: {
    userId: string;
    config: WidgetMultiAgentConfig;
    plan: string;
  } | null = null;

  // Validate wt_ token and quota
  if (widgetToken.startsWith('wt_') && parsedAgentId) {
    try {
      await connectDB();
      const w = await findWidgetForWtToken(widgetToken, parsedWidgetId || undefined);
      if (w) {
        if (!resolvedWidgetId && w.id) resolvedWidgetId = w.id;
        if (!isWidgetActive(w)) {
          return new Response(
            sseEvent({
              type: 'error',
              message: 'Este widget está desactivado. Contacta al administrador del sitio.',
              code: 'WIDGET_DISABLED',
            }),
            { status: 403, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
          );
        }

        // ── Domain allowlist check ────────────────────────────────────────
        if (!isOriginAllowed(req.headers.get('origin'), w.allowedOrigins)) {
          return new Response(
            sseEvent({ type: 'error', message: 'Origen no permitido para este widget.', code: 'ORIGIN_NOT_ALLOWED' }),
            { status: 403, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
          );
        }

        const match = await sentAgentIdMatchesWidget(parsedAgentId, w.agentId);
        if (!match) {
          return new Response(
            sseEvent({ type: 'error', message: 'El agentId no coincide con el widget.', code: 'WIDGET_AGENT_MISMATCH' }),
            { status: 403, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
          );
        }
        faqTrackOwnerId = w.userId;

        const [quota, subDoc] = await Promise.all([
          checkConversationQuota(w.userId),
          Subscription.findOne({ userId: w.userId })
            .select({ status: 1, plan: 1 })
            .lean() as Promise<{ status?: string; plan?: string } | null>,
        ]);

        if (!quota.allowed) {
          latencyTrace.mark('auth');
          finalizeWidgetChatTrace(latencyTrace, { ok: false, errorCode: 'QUOTA_EXCEEDED' });
          return new Response(
            sseEvent({ type: 'error', message: `Límite de ${quota.limit.toLocaleString('es')} conversaciones alcanzado.`, code: 'QUOTA_EXCEEDED' }),
            { status: 200, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
          );
        }

        try {
          const hasActivePlan =
            subDoc?.status === 'active' || subDoc?.status === 'trialing';
          const userTurnCount = guardResult.turnCount ?? 0;
          if (!isLocalDevLimitsBypass() && !hasActivePlan && userTurnCount >= 2) {
            latencyTrace.mark('auth');
            finalizeWidgetChatTrace(latencyTrace, { ok: false, errorCode: 'WIDGET_PROVIDER_SUBSCRIPTION_REQUIRED' });
            return new Response(
              sseEvent({
                type: 'error',
                message:
                  'No podemos responder en este momento. Por favor, comunicate con la empresa proveedora del servicio para continuar.',
                code: 'WIDGET_PROVIDER_SUBSCRIPTION_REQUIRED',
              }),
              { status: 403, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
            );
          }
        } catch {
          /* fail-open */
        }

        // Agentes con webhook siguen el mismo proxy hub; Fase 1 emite status SSE durante la espera.

        try {
          const active =
            subDoc?.status === 'active' || subDoc?.status === 'trialing';
          const planForRoute = active ? (subDoc?.plan ?? 'free') : 'free';
          multiAgentCtx = {
            userId: w.userId,
            plan: planForRoute,
            config: buildWidgetMultiAgentConfig(w),
          };
        } catch (routeErr) {
          console.warn('[widget/chat/stream] multi-agent context skipped:', routeErr);
        }

        // enrichWidgetChatBody (reescribe rawBody) e isInternalAppAssistWidget
        // (solo necesita widgetId/agentId, no rawBody) no dependen entre sí — se
        // lanzan juntas en vez de una tras otra. El import del módulo assist se
        // deja en marcha aquí y se resuelve más abajo, sin duplicarlo.
        const assistModulePromise = import('@/lib/assist-session-identity');

        const [, isAssist] = await Promise.all([
          (async () => {
            try {
              rawBody = await enrichWidgetChatBody({
                rawBody,
                ownerUserId: w.userId,
                widgetId: resolvedWidgetId || w.id,
              });
              const reparse = JSON.parse(rawBody) as { sessionId?: string; visitorId?: string; message?: string };
              if (typeof reparse.sessionId === 'string' && reparse.sessionId.trim()) {
                parsedSessionId = reparse.sessionId.trim();
              }
              parsedVisitorId = normalizeVisitorId(reparse.visitorId) ?? parsedVisitorId;
              if (typeof reparse.message === 'string') parsedMessage = reparse.message;
            } catch (enrichErr) {
              console.warn('[widget/chat/stream] enrich body skipped:', enrichErr);
            }
          })(),
          assistModulePromise
            .then((m) =>
              m.isInternalAppAssistWidget({
                widgetId: resolvedWidgetId || w.id,
                agentId: parsedAgentId,
              }),
            )
            .catch(() => false),
        ]);

        // A partir de aquí rawBody/parsedSessionId ya están enriquecidos. La
        // inyección de contexto assist (necesita el rawBody enriquecido) y el
        // lookup de vision previo (necesita el parsedSessionId enriquecido) no
        // dependen entre sí — también corren juntas.
        const visionWidgetId = resolvedWidgetId || w.id;

        await Promise.all([
          (async () => {
            // Assist dashboard (Math-ais): contexto del usuario logueado (sin HubSpot).
            if (!isAssist) return;
            try {
              const { identityFromSessionCookie, injectAssistContextIntoChatBody } =
                await assistModulePromise;
              let j = JSON.parse(rawBody) as Record<string, unknown>;
              j.hubspotAutoCaptureContacts = false;
              isAssistWidget = true;
              const identity = await identityFromSessionCookie(
                req.cookies.get('afhub_session')?.value,
              );
              if (identity) {
                j.visitorUserId = identity.userId;
                const pagePath = typeof j.pagePath === 'string' ? j.pagePath : undefined;
                j = await injectAssistContextIntoChatBody(j, identity, pagePath, {
                  hasUserImage: Boolean(imageEnrichment?.images?.length),
                });
              }
              rawBody = JSON.stringify(j);
            } catch (idErr) {
              console.warn('[widget/chat/stream] assist identity inject skipped:', idErr);
            }
          })(),
          (async () => {
            if (imageEnrichment && visionWidgetId && parsedSessionId) {
              void persistSessionVisionAnalysis(
                visionWidgetId,
                parsedSessionId,
                w.userId,
                imageEnrichment,
              ).catch(() => {});
            } else if (
              !imageEnrichment &&
              visionWidgetId &&
              parsedSessionId &&
              !isTrivialMessage(guardResult.text || '')
            ) {
              try {
                const prior = await loadSessionVisionEnrichment(
                  visionWidgetId,
                  parsedSessionId,
                  w.userId,
                  guardResult.text || '',
                );
                if (
                  prior &&
                  shouldUsePriorImage({
                    message: guardResult.text || '',
                    analyzedAt: prior.analyzedAt,
                    trivial: false,
                  })
                ) {
                  activeVisionEnrichment = prior.enrichment;
                }
              } catch {
                /* ignore */
              }
            }
          })(),
        ]);

        // finalizeWidgetChatBodyWithVision necesita el rawBody final (post
        // inyección assist) y activeVisionEnrichment (post lookup de arriba),
        // así que corre después de que ambas ramas anteriores terminaron.
        if (activeVisionEnrichment?.analyses?.length && parsedAgentId) {
          try {
            rawBody = await finalizeWidgetChatBodyWithVision({
              rawBody,
              enrichment: activeVisionEnrichment,
              agentId: parsedAgentId,
              ownerUserId: w.userId,
              strictPurposeSuffix: STRICT_PURPOSE_SUFFIX,
            });
          } catch (visionErr) {
            console.warn('[widget/chat/stream] vision context finalize skipped:', visionErr);
          }
        }
      }
      latencyTrace.mark('auth');
    } catch {
      /* fail-open */
    }
  }

  // ── Guard modo humano (defensa server-side, también en stream) ─────────────
  // Si un agente humano atiende, NO ejecutar el AI: guardamos el mensaje del
  // visitante y devolvemos un aviso por SSE. Protege contra SDKs viejos.
  if (parsedSessionId && faqTrackOwnerId) {
    try {
      const humanHit = await latencyTrace.span('human_guard', async () => {
        await connectDB();
        const liveSession = await ConversationSession.findOne({
          chatSessionId: parsedSessionId,
          humanMode: true,
        }).select({ inboxStatus: 1 }).lean() as { inboxStatus?: string } | null;
        if (liveSession && liveSession.inboxStatus !== 'resolved') {
          if (parsedMessage.trim()) {
            await WidgetMessage.create({
              widgetId: resolvedWidgetId,
              userId: faqTrackOwnerId,
              agentId: parsedAgentId || '',
              sessionId: parsedSessionId,
              role: 'user',
              content: parsedMessage.trim().slice(0, 4000),
              traceId: `human-mode:${traceId}`,
            }).catch(() => {});
          }
          return 'human';
        }
        return null;
      });
      if (humanHit === 'human') {
        const note = 'Un miembro del equipo está atendiendo esta conversación y te responderá aquí mismo.';
        latencyTrace.setPath('human-mode');
        finalizeWidgetChatTrace(latencyTrace, { ok: true, replyLen: note.length });
        return new Response(
          sseEvent({ type: 'token', text: note }) + sseEvent({ type: 'done', humanMode: true }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
        );
      }
    } catch (hmErr) {
      console.warn('[widget/chat/stream] human-mode guard skipped:', hmErr);
    }
  }

  const base = getAgentflowhubBaseUrl();
  const hubSecret = process.env.HUB_TO_LANDING_SECRET?.trim() ?? '';

  // SSE stream — routing multiagente dentro del stream para emitir status en tiempo real
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) => {
        if (data.type === 'status' && typeof data.phase === 'string') {
          latencyTrace.recordSsePhase(data.phase);
        }
        controller.enqueue(encoder.encode(sseEvent(data)));
      };

      let hubBody = rawBody;
      let parsedAgentIdLocal = parsedAgentId;
      let multiAgentMeta: MultiAgentRoutingMeta | null = null;
      let orchestratorName = 'Asistente';
      let activeVariantId: string | null = null;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Trace-Id': traceId,
        'X-Request-Id': traceId,
      };
      if (widgetToken) headers['X-Widget-Token'] = widgetToken;

      latencyTrace.setMeta({
        userId: faqTrackOwnerId,
        agentId: parsedAgentIdLocal || parsedAgentId,
        widgetId: resolvedWidgetId || parsedWidgetId,
        sessionId: parsedSessionId || traceId,
      });

      try {
        const userMsgForStatus = userDisplayMessage || parsedMessage;
        // Boot honesto: solo prepare (+ triage si multiagente). Sin rag/model/hub de adorno.
        const bootPhases = landingBootStatusPhases(
          Boolean(multiAgentCtx?.config.multiAgentEnabled),
        );
        for (const phase of bootPhases) {
          if (phase === 'prepare') {
            emitWidgetChatStatusForTurn(enqueue, userMsgForStatus, 'prepare');
          } else {
            emitWidgetChatStatus(enqueue, phase);
          }
        }

        // ── Formulario de ticket + encuesta de deflection, por código, sin depender del LLM ──
        // Mismo bloque que /api/widget/chat (no-stream) — ver ese archivo y
        // ticket-deflection-intent.ts para el detalle de diseño.
        //
        // IMPORTANTE — por qué va ACÁ y no más abajo, antes del proxy final:
        // agentes con webhook/HubSpot/skills-MCP (ej. Tribu GPS) toman el
        // camino "directo" a AIBackHub (tryServeWidgetChatViaHubMcp, más abajo)
        // y ESE devuelve la respuesta antes de llegar a donde vivía este bloque
        // originalmente — nunca corría para ese tipo de agente en producción
        // (bug real, encontrado probando en vivo contra Tribu GPS: local
        // funcionaba porque el camino directo fallaba distinto ahí, pero en
        // prod el camino directo sí respondía y se saltaba todo esto). Puesto
        // acá, antes de multiagente/directo/hub, intercepta siempre que
        // corresponda.
        try {
          const ticketAgentOr = [
            ...(parsedAgentIdLocal.match(/^[a-f0-9]{24}$/i) ? [{ _id: parsedAgentIdLocal }] : []),
            { agentHubId: parsedAgentIdLocal },
          ];
          const ticketAgentDoc = (await ClientAgent.findOne({ $or: ticketAgentOr })
            .select({ enabledMcpToolIds: 1, agentHubId: 1 })
            .lean()) as { enabledMcpToolIds?: string[]; agentHubId?: string } | null;

          const hasTicketCapability = Array.isArray(ticketAgentDoc?.enabledMcpToolIds)
            && ticketAgentDoc.enabledMcpToolIds.some((t) => t.includes('_create_ticket'));
          const ownerUserId = faqTrackOwnerId || '';
          // El RAG (matias-backend) indexa los vectores por agentHubId, no por
          // el _id de landing — sin esto, checkTicketDeflection() nunca
          // encuentra los chunks del agente cuando parsedAgentIdLocal llega
          // como ObjectId (bug real, encontrado probando en vivo).
          const ragAgentId = ticketAgentDoc?.agentHubId || parsedAgentIdLocal;
          const sessionKeyReady = Boolean(
            hasTicketCapability && ownerUserId && resolvedWidgetId && parsedSessionId,
          );

          const respondWithText = async (text: string) => {
            await latencyTrace.span('reveal', () => emitStreamTokensFromText(enqueue, text));
            emitDoneAndPersist(
              enqueue,
              attachAssistNavToPayload(
                { type: 'done', reply: text, agentId: parsedAgentIdLocal, streamed: true },
                isAssistWidget,
                text,
                assistNavCtx,
              ),
              ownerUserId && resolvedWidgetId && parsedSessionId
                ? {
                    widgetId: resolvedWidgetId,
                    userId: ownerUserId,
                    agentId: parsedAgentIdLocal,
                    sessionId: parsedSessionId,
                    traceId,
                    userMessage: parsedMessage,
                    assistantMessage: text,
                  }
                : null,
            );
            latencyTrace.setPath('stream-ticket-deflection');
            finalizeWidgetChatTrace(latencyTrace, { ok: true, replyLen: text.length });
          };

          const pendingSurvey = sessionKeyReady
            ? await getPendingDeflectionSurvey(resolvedWidgetId, parsedSessionId, ownerUserId)
            : null;

          if (pendingSurvey) {
            const answer = interpretYesNo(parsedMessage);
            if (answer === 'yes' || answer === 'no') {
              await clearTicketDeflectionState(resolvedWidgetId, parsedSessionId, ownerUserId);
              logWidgetFlow('🎫', 'stream:deflectionSurveyAnswer', `encuesta respondida: ${answer}`, { traceId });
              await respondWithText(answer === 'yes' ? buildDeflectionResolvedReply() : OPEN_TICKET_FORM_MARKER);
              return;
            }
            await clearTicketDeflectionState(resolvedWidgetId, parsedSessionId, ownerUserId);
          } else if (
            sessionKeyReady
            && (await isAwaitingProblemDescription(resolvedWidgetId, parsedSessionId, ownerUserId))
          ) {
            await clearTicketDeflectionState(resolvedWidgetId, parsedSessionId, ownerUserId);
            const deflection = await checkTicketDeflection({ agentId: ragAgentId, query: parsedMessage });
            logWidgetFlow('🎫', 'stream:deflectionCheck', `problema descrito, confident=${deflection.confident}`, { traceId });
            if (deflection.confident) {
              await setPendingDeflectionSurvey(resolvedWidgetId, parsedSessionId, ownerUserId, {
                sourceText: deflection.sourceText,
              });
              await respondWithText(buildDeflectionSurveyReply(deflection.sourceText));
            } else {
              await respondWithText(OPEN_TICKET_FORM_MARKER);
            }
            return;
          } else if (looksLikeTicketRequest(parsedMessage)) {
            const priorUserMsgs = parsedSessionId
              ? ((await WidgetMessage.find({ sessionId: parsedSessionId, role: 'user' })
                  .select({ content: 1 })
                  .limit(80)
                  .lean()) as { content?: string }[])
              : [];

            const shouldProceed = shouldForceTicketForm({
              message: parsedMessage,
              history: priorUserMsgs.map((m) => ({ role: 'user', content: m.content })),
              hasTicketCapability,
            });

            if (shouldProceed) {
              const remainder = extractRemainderAfterMatch(parsedMessage, TICKET_INTENT_PATTERNS);
              if (isVagueRemainder(remainder)) {
                logWidgetFlow('🎫', 'stream:ticketVague', 'pedido de ticket vago — se pregunta el problema', { traceId });
                if (sessionKeyReady) {
                  await setAwaitingProblemDescription(resolvedWidgetId, parsedSessionId, ownerUserId);
                }
                await respondWithText(buildAskProblemReply());
                return;
              }

              const deflection = await checkTicketDeflection({ agentId: ragAgentId, query: parsedMessage });
              logWidgetFlow('🎫', 'stream:forceTicketForm', `detección por código, confident=${deflection.confident}`, { traceId });
              if (deflection.confident) {
                if (sessionKeyReady) {
                  await setPendingDeflectionSurvey(resolvedWidgetId, parsedSessionId, ownerUserId, {
                    sourceText: deflection.sourceText,
                  });
                }
                await respondWithText(buildDeflectionSurveyReply(deflection.sourceText));
              } else {
                await respondWithText(OPEN_TICKET_FORM_MARKER);
              }
              return;
            }
          }
        } catch (err) {
          // Fail-open: si este chequeo falla, seguimos con el flujo normal SSE.
          logWidgetFlow('⚠️', 'stream:forceTicketFormErr', 'chequeo de ticket-form falló, sigue flujo normal', {
            traceId,
            err: err instanceof Error ? err.message : String(err),
          });
        }

        if (multiAgentCtx) {
          if (multiAgentCtx.config.multiAgentEnabled && multiAgentCtx.config.multiAgentMode === 'pipeline' && hubSecret) {
            const pipeline = await latencyTrace.span('multi_pipeline', () => executePipelineMultiAgentFlow({
              rawBody: hubBody,
              config: multiAgentCtx.config,
              userId: multiAgentCtx.userId,
              plan: multiAgentCtx.plan,
              widgetToken,
              traceId,
              hubSecret,
              onPhase: (phase, message) => {
                enqueue({ type: 'status', phase, message });
              },
            }));
            if (pipeline) {
              parsedAgentIdLocal = pipeline.routedHubAgentId;
              multiAgentMeta = pipeline.meta;
              const orch = await ClientAgent.findById(pipeline.meta.orchestratorId)
                .select({ name: 1 })
                .lean() as { name?: string } | null;
              orchestratorName = typeof orch?.name === 'string' ? orch.name : 'Asistente';
              logWidgetFlow('🔀', 'stream:multiAgentPipeline', 'pipeline contenido→creativo', {
                traceId,
                creativeAgent: pipeline.meta.routedAgentName,
              });
              emitWidgetChatStatus(enqueue, 'model');
              await latencyTrace.span('reveal', () => emitStreamTokensFromText(enqueue, pipeline.reply));
              if (widgetToken.startsWith('wt_') && parsedAgentIdLocal) {
                void trackWidgetChatUsage(widgetToken, parsedAgentIdLocal, true, undefined, meteringInput).catch(() => {});
              }
              if (faqTrackOwnerId) {
                void afterWidgetChatSuccess({
                  ownerUserId: faqTrackOwnerId,
                  widgetId: resolvedWidgetId,
                  chatSessionId: parsedSessionId || traceId,
                  visitorId: parsedVisitorId,
                  hubAgentId: pipeline.routedHubAgentId,
                  userMessage: userDisplayMessage || parsedMessage,
                  agentResponse: pipeline.reply,
                  routingMeta: pipeline.meta,
                });
              }
              emitDoneAndPersist(
                enqueue,
                {
                  type: 'done',
                  reply: pipeline.reply,
                  agentId: pipeline.routedHubAgentId,
                  multiAgent: pipeline.meta,
                  streamed: true,
                  ...(pipeline.images?.length ? { images: pipeline.images } : {}),
                },
                faqTrackOwnerId
                  ? {
                      widgetId: resolvedWidgetId,
                      userId: faqTrackOwnerId,
                      agentId: pipeline.routedHubAgentId,
                      sessionId: parsedSessionId || traceId,
                      traceId,
                      userMessage: userDisplayMessage || parsedMessage,
                      assistantMessage: pipeline.reply,
                      enrichment: imageEnrichment,
                    }
                  : null,
              );
              latencyTrace.setPath('stream-pipeline');
              logStreamOpsMetric({
                userId: faqTrackOwnerId,
                agentId: pipeline.routedHubAgentId || parsedAgentIdLocal,
                widgetId: resolvedWidgetId,
                sessionId: parsedSessionId || traceId,
                traceId,
                path: 'stream-pipeline',
                reply: pipeline.reply,
              });
              finalizeWidgetChatTrace(latencyTrace, { ok: true, replyLen: pipeline.reply.length });
              return;
            }
          }

          if (multiAgentCtx.config.multiAgentEnabled && multiAgentCtx.config.multiAgentMode === 'parallel' && hubSecret) {
            const parallel = await latencyTrace.span('multi_parallel', () => executeParallelMultiAgentFlow({
              rawBody: hubBody,
              config: multiAgentCtx.config,
              userId: multiAgentCtx.userId,
              plan: multiAgentCtx.plan,
              widgetToken,
              traceId,
              hubSecret,
              onPhase: (phase, message) => {
                enqueue({ type: 'status', phase, message });
              },
            }));
            if (parallel) {
              parsedAgentIdLocal = parallel.routedHubAgentId;
              multiAgentMeta = parallel.meta;
              const orch = await ClientAgent.findById(parallel.meta.orchestratorId)
                .select({ name: 1 })
                .lean() as { name?: string } | null;
              orchestratorName = typeof orch?.name === 'string' ? orch.name : 'Asistente';
              logWidgetFlow('🔀', 'stream:multiAgentParallel', 'síntesis multiagente', {
                traceId,
                routedAgentId: parallel.meta.routedAgentId,
                synthesized: parallel.meta.synthesized,
              });
              emitWidgetChatStatus(enqueue, 'model');
              await latencyTrace.span('reveal', () => emitStreamTokensFromText(enqueue, parallel.reply));
              if (widgetToken.startsWith('wt_') && parsedAgentIdLocal) {
                void trackWidgetChatUsage(widgetToken, parsedAgentIdLocal, true, undefined, meteringInput).catch(() => {});
              }
              if (faqTrackOwnerId) {
                void afterWidgetChatSuccess({
                  ownerUserId: faqTrackOwnerId,
                  widgetId: resolvedWidgetId,
                  chatSessionId: parsedSessionId || traceId,
                  visitorId: parsedVisitorId,
                  hubAgentId: parallel.routedHubAgentId,
                  userMessage: userDisplayMessage || parsedMessage,
                  agentResponse: parallel.reply,
                  routingMeta: parallel.meta,
                });
              }
              emitDoneAndPersist(
                enqueue,
                {
                  type: 'done',
                  reply: parallel.reply,
                  agentId: parallel.routedHubAgentId,
                  multiAgent: parallel.meta,
                  streamed: true,
                },
                faqTrackOwnerId
                  ? {
                      widgetId: resolvedWidgetId,
                      userId: faqTrackOwnerId,
                      agentId: parallel.routedHubAgentId,
                      sessionId: parsedSessionId || traceId,
                      traceId,
                      userMessage: userDisplayMessage || parsedMessage,
                      assistantMessage: parallel.reply,
                      enrichment: imageEnrichment,
                    }
                  : null,
              );
              latencyTrace.setPath('stream-parallel');
              logStreamOpsMetric({
                userId: faqTrackOwnerId,
                agentId: parallel.routedHubAgentId || parsedAgentIdLocal,
                widgetId: resolvedWidgetId,
                sessionId: parsedSessionId || traceId,
                traceId,
                path: 'stream-parallel',
                reply: parallel.reply,
              });
              finalizeWidgetChatTrace(latencyTrace, { ok: true, replyLen: parallel.reply.length });
              return;
            }
          }

          const routing = await latencyTrace.span('multi_triage', () => applyMultiAgentRouting({
            rawBody: hubBody,
            config: multiAgentCtx.config,
            userId: multiAgentCtx.userId,
            plan: multiAgentCtx.plan,
            trace: latencyTrace,
          }));
          if (routing) {
            hubBody = routing.body;
            parsedAgentIdLocal = routing.routedHubAgentId;
            multiAgentMeta = routing.meta;
            const orch = await ClientAgent.findById(routing.meta.orchestratorId)
              .select({ name: 1 })
              .lean() as { name?: string } | null;
            orchestratorName = typeof orch?.name === 'string' ? orch.name : 'Asistente';
            if (routing.meta.handoff) {
              enqueue({
                type: 'status',
                phase: 'handoff',
                message: buildMultiAgentStatusMessage('handoff', routing.meta.routedAgentName),
                specialist: routing.meta.routedAgentName,
              });
            }
            logWidgetFlow('🔀', 'stream:multiAgent', 'triaje multiagente', {
              traceId,
              routedAgentId: routing.meta.routedAgentId,
              method: routing.meta.triageMethod,
              handoff: routing.meta.handoff,
            });
          }
        }

        if (parsedAgentIdLocal) {
          try {
            const sessionBucket = parsedSessionId || traceId;
            const variant = await latencyTrace.span('ab_variant', () =>
              getActiveVariant(parsedAgentIdLocal, sessionBucket),
            );
            if (variant) {
              activeVariantId = variant.id;
              const parsed = JSON.parse(hubBody) as Record<string, unknown>;
              parsed.systemPromptOverride = variant.systemPrompt;
              parsed._abVariantId = variant.id;
              hubBody = JSON.stringify(parsed);
            }
          } catch {
            /* non-critical */
          }
        }

        if (parsedAgentId) {
          try {
            await latencyTrace.span('strict_purpose', async () => {
            await connectDB();
            const agentFilter = /^[a-f0-9]{24}$/i.test(parsedAgentId)
              ? { _id: parsedAgentId }
              : { agentHubId: parsedAgentId };
            const agentDoc = await ClientAgent.findOne(agentFilter, { strictPurposeOnly: 1, systemPrompt: 1 })
              .lean() as { strictPurposeOnly?: boolean; systemPrompt?: string } | null;

            if (activeVisionEnrichment) {
              hubBody = mergeVisionContextIntoBody(
                hubBody,
                activeVisionEnrichment,
                agentDoc?.systemPrompt,
              );
            }

            if (agentDoc?.strictPurposeOnly === true) {
              const parsed = JSON.parse(hubBody) as Record<string, unknown>;
              const basePrompt = typeof parsed.systemPromptOverride === 'string'
                ? parsed.systemPromptOverride
                : (agentDoc.systemPrompt ?? '');
              parsed.systemPromptOverride = basePrompt + STRICT_PURPOSE_SUFFIX;
              hubBody = JSON.stringify(parsed);
            }
            });
          } catch { /* non-critical */ }
        }

        emitWidgetChatStatus(enqueue, 'resolve');

        // Misma cadena que /api/widget/chat: MCP directo → inferencia directa → hub (último recurso).
        if (widgetToken.startsWith('wt_') && faqTrackOwnerId && parsedAgentIdLocal) {
          try {
            const directMcp = await latencyTrace.span('direct_mcp', () =>
              tryServeWidgetChatViaHubMcp({
                widgetTokenStartsWithWt: true,
                parsedAgentId: parsedAgentIdLocal,
                rawBody: hubBody,
                ownerUserId: faqTrackOwnerId,
                visionEnrichment: activeVisionEnrichment,
                strictPurposeSuffix: STRICT_PURPOSE_SUFFIX,
                onStatus: (phase, message) => {
                  enqueue({ type: 'status', phase, message });
                },
              }),
            );
            if (directMcp?.reply) {
              logWidgetFlow('✅', 'stream:directMcpOk', 'respuesta AIBackHub MCP', {
                traceId,
                replyLen: directMcp.reply.length,
                toolsUsed: directMcp.toolsUsed ?? [],
              });
              await latencyTrace.span('reveal', () => emitStreamTokensFromText(enqueue, directMcp.reply));
              void trackWidgetChatUsage(widgetToken, parsedAgentIdLocal, true, undefined, meteringInput).catch(() => {});
              if (faqTrackOwnerId) {
                void trackWidgetUserMessageForFaqCandidates({
                  ownerUserId: faqTrackOwnerId,
                  agentIdOrHubId: parsedAgentIdLocal,
                  rawBody: rawBodyInitial,
                  agentReply: directMcp.reply,
                }).catch(() => {});
                void afterWidgetChatSuccess({
                  ownerUserId: faqTrackOwnerId,
                  widgetId: resolvedWidgetId,
                  chatSessionId: parsedSessionId || traceId,
                  visitorId: parsedVisitorId,
                  hubAgentId: parsedAgentIdLocal,
                  userMessage: userDisplayMessage || parsedMessage,
                  agentResponse: directMcp.reply,
                  routingMeta: multiAgentMeta,
                });
              }
              emitDoneAndPersist(
                enqueue,
                attachAssistNavToPayload(
                  {
                    type: 'done',
                    reply: directMcp.reply,
                    agentId: parsedAgentIdLocal,
                    streamed: true,
                    ...(directMcp.toolsUsed?.length ? { toolsUsed: directMcp.toolsUsed } : {}),
                    ...(multiAgentMeta ? { multiAgent: multiAgentMeta } : {}),
                  },
                  isAssistWidget,
                  directMcp.reply,
                  assistNavCtx,
                ),
                faqTrackOwnerId
                  ? {
                      widgetId: resolvedWidgetId,
                      userId: faqTrackOwnerId,
                      agentId: parsedAgentIdLocal,
                      sessionId: parsedSessionId || traceId,
                      traceId,
                      userMessage: userDisplayMessage || parsedMessage,
                      assistantMessage: directMcp.reply,
                      enrichment: imageEnrichment,
                      toolsUsed: directMcp.toolsUsed,
                    }
                  : null,
              );
              latencyTrace.setPath('stream-direct-mcp');
              logStreamOpsMetric({
                userId: faqTrackOwnerId,
                agentId: parsedAgentIdLocal,
                widgetId: resolvedWidgetId,
                sessionId: parsedSessionId || traceId,
                traceId,
                path: 'stream-direct-mcp',
                reply: directMcp.reply,
                toolsUsed: directMcp.toolsUsed,
              });
              finalizeWidgetChatTrace(latencyTrace, {
                ok: true,
                replyLen: directMcp.reply.length,
                toolsUsed: directMcp.toolsUsed,
              });
              return;
            }
          } catch (mcpErr) {
            logWidgetFlow('⚠️', 'stream:directMcpErr', mcpErr instanceof Error ? mcpErr.message : String(mcpErr));
          }

          try {
            const inferredEarly = await latencyTrace.span('infer_direct', () =>
              tryServeWidgetChatViaDirectInference({
                parsedAgentId: parsedAgentIdLocal,
                rawBody: hubBody,
                ownerUserId: faqTrackOwnerId,
                onStatus: (phase, message) => {
                  enqueue({ type: 'status', phase, message });
                },
              }),
            );
            if (inferredEarly?.reply) {
              logWidgetFlow('✅', 'stream:inferOkEarly', 'respuesta directa /api/models', {
                traceId,
                replyLen: inferredEarly.reply.length,
                usedModel: inferredEarly.usedModel,
              });
              await latencyTrace.span('reveal', () => emitStreamTokensFromText(enqueue, inferredEarly.reply));
              void trackWidgetChatUsage(widgetToken, parsedAgentIdLocal, true, undefined, meteringInput).catch(() => {});
              if (faqTrackOwnerId) {
                void trackWidgetUserMessageForFaqCandidates({
                  ownerUserId: faqTrackOwnerId,
                  agentIdOrHubId: parsedAgentIdLocal,
                  rawBody: rawBodyInitial,
                  agentReply: inferredEarly.reply,
                }).catch(() => {});
                void afterWidgetChatSuccess({
                  ownerUserId: faqTrackOwnerId,
                  widgetId: resolvedWidgetId,
                  chatSessionId: parsedSessionId || traceId,
                  visitorId: parsedVisitorId,
                  hubAgentId: parsedAgentIdLocal,
                  userMessage: userDisplayMessage || parsedMessage,
                  agentResponse: inferredEarly.reply,
                  routingMeta: multiAgentMeta,
                });
              }
              emitDoneAndPersist(
                enqueue,
                attachAssistNavToPayload(
                  {
                    type: 'done',
                    reply: inferredEarly.reply,
                    agentId: parsedAgentIdLocal,
                    streamed: true,
                    ...(inferredEarly.usedModel ? { usedModel: inferredEarly.usedModel } : {}),
                    ...(multiAgentMeta ? { multiAgent: multiAgentMeta } : {}),
                  },
                  isAssistWidget,
                  inferredEarly.reply,
                  assistNavCtx,
                ),
                faqTrackOwnerId
                  ? {
                      widgetId: resolvedWidgetId,
                      userId: faqTrackOwnerId,
                      agentId: parsedAgentIdLocal,
                      sessionId: parsedSessionId || traceId,
                      traceId,
                      userMessage: userDisplayMessage || parsedMessage,
                      assistantMessage: inferredEarly.reply,
                      enrichment: imageEnrichment,
                    }
                  : null,
              );
              latencyTrace.setPath('stream-infer-direct');
              logStreamOpsMetric({
                userId: faqTrackOwnerId,
                agentId: parsedAgentIdLocal,
                widgetId: resolvedWidgetId,
                sessionId: parsedSessionId || traceId,
                traceId,
                path: 'stream-infer-direct',
                reply: inferredEarly.reply,
              });
              finalizeWidgetChatTrace(latencyTrace, {
                ok: true,
                replyLen: inferredEarly.reply.length,
              });
              return;
            }
          } catch (inferEarlyErr) {
            logWidgetFlow('⚠️', 'stream:inferEarlyErr', inferEarlyErr instanceof Error ? inferEarlyErr.message : String(inferEarlyErr));
          }
        }

        const hubAgentResolve = await latencyTrace.span('resolve', () =>
          resolveHubAgentIdInBody(hubBody, faqTrackOwnerId ?? undefined),
        );
        if (!hubAgentResolve.ok) {
          enqueue({
            type: 'error',
            message: friendlyWidgetChatError(hubAgentResolve.code, hubAgentResolve.message),
            code: hubAgentResolve.code,
            ...(hubAgentResolve.hint ? { hint: hubAgentResolve.hint } : {}),
          });
          latencyTrace.setPath('stream-error');
          finalizeWidgetChatTrace(latencyTrace, { ok: false, errorCode: hubAgentResolve.code });
          return;
        }
        hubBody = hubAgentResolve.body;
        const hubAgentId = hubAgentResolve.hubAgentId || parsedAgentIdLocal;
        if (hubAgentResolve.hubAgentId) {
          parsedAgentIdLocal = hubAgentResolve.hubAgentId;
        }

        if (hubSecret && widgetToken.startsWith('wt_')) {
          headers['X-Landing-Wt-Valid'] = '1';
          headers[SIGNATURE_HEADER] = signRequest(hubBody, hubSecret);
          headers['x-hub-sync-secret'] = hubSecret;
        }

        if (widgetToken.startsWith('wt_') && faqTrackOwnerId && parsedAgentIdLocal) {
          try {
            const inferred = await latencyTrace.span('infer_direct', () =>
              tryServeWidgetChatViaDirectInference({
              parsedAgentId: parsedAgentIdLocal,
              rawBody: hubBody,
              ownerUserId: faqTrackOwnerId,
              onStatus: (phase, message) => {
                enqueue({ type: 'status', phase, message });
              },
            }),
            );
            if (inferred?.reply) {
              logWidgetFlow('✅', 'stream:inferOk', 'respuesta directa /api/models', {
                traceId,
                replyLen: inferred.reply.length,
                usedModel: inferred.usedModel,
              });
              await latencyTrace.span('reveal', () => emitStreamTokensFromText(enqueue, inferred.reply));
              void trackWidgetChatUsage(widgetToken, parsedAgentIdLocal, true, undefined, meteringInput).catch(() => {});
              if (faqTrackOwnerId) {
                void trackWidgetUserMessageForFaqCandidates({
                  ownerUserId: faqTrackOwnerId,
                  agentIdOrHubId: parsedAgentIdLocal,
                  rawBody: rawBodyInitial,
                  agentReply: inferred.reply,
                }).catch(() => {});
                void afterWidgetChatSuccess({
                  ownerUserId: faqTrackOwnerId,
                  widgetId: resolvedWidgetId,
                  chatSessionId: parsedSessionId || traceId,
                  visitorId: parsedVisitorId,
                  hubAgentId: parsedAgentIdLocal,
                  userMessage: userDisplayMessage || parsedMessage,
                  agentResponse: inferred.reply,
                  routingMeta: multiAgentMeta,
                });
              }
              emitDoneAndPersist(
                enqueue,
                attachAssistNavToPayload(
                  {
                    type: 'done',
                    reply: inferred.reply,
                    agentId: parsedAgentIdLocal,
                    streamed: true,
                    ...(inferred.usedModel ? { usedModel: inferred.usedModel } : {}),
                    ...(multiAgentMeta ? { multiAgent: multiAgentMeta } : {}),
                  },
                  isAssistWidget,
                  inferred.reply,
                  assistNavCtx,
                ),
                faqTrackOwnerId
                  ? {
                      widgetId: resolvedWidgetId,
                      userId: faqTrackOwnerId,
                      agentId: parsedAgentIdLocal,
                      sessionId: parsedSessionId || traceId,
                      traceId,
                      userMessage: userDisplayMessage || parsedMessage,
                      assistantMessage: inferred.reply,
                      enrichment: imageEnrichment,
                    }
                  : null,
              );
              latencyTrace.setPath('stream-infer-direct');
              logStreamOpsMetric({
                userId: faqTrackOwnerId,
                agentId: parsedAgentIdLocal,
                widgetId: resolvedWidgetId,
                sessionId: parsedSessionId || traceId,
                traceId,
                path: 'stream-infer-direct',
                reply: inferred.reply,
              });
              finalizeWidgetChatTrace(latencyTrace, { ok: true, replyLen: inferred.reply.length });
              return;
            }
          } catch (inferErr) {
            logWidgetFlow('⚠️', 'stream:inferErr', inferErr instanceof Error ? inferErr.message : String(inferErr));
          }
        }

        let streamMsg = '';
        try {
          const hb = JSON.parse(hubBody) as { message?: string };
          streamMsg = typeof hb?.message === 'string' ? hb.message : '';
        } catch {
          /* ignore */
        }
        const hubUrl = getHubWidgetChatUrl(base);
        logWidgetFlow('🌊', 'stream:fetch', 'SSE → AgentFlowhub', {
          traceId,
          hubUrl,
          agentId: hubAgentId || parsedAgentId || undefined,
          ...widgetMessageProbe(streamMsg),
        });
        // Pulse solo en hub (espera real). tools/mcp/model los emite el motor si aplican.
        const res = await latencyTrace.span('hub', () =>
          runWithWidgetStatusPulse(enqueue, streamMsg, 'hub', () =>
            fetchHubWidgetChat(base, {
              method: 'POST',
              headers,
              body: hubBody,
              signal: AbortSignal.timeout(120_000),
            }),
          ),
        );

        const json = await res.json() as {
          reply?: string;
          response?: string;
          text?: string;
          agentId?: string;
          toolsUsed?: string[];
          mcpTag?: string;
          usedModel?: string;
          images?: Array<{ dataUrl: string; mimeType?: string }>;
          code?: string;
          error?: string;
          usage?: { inputTokens?: number; outputTokens?: number };
        };

        if (!res.ok || json.code === 'AGENT_COOLDOWN' || json.error) {
          const msg = friendlyWidgetChatError(json.code, json.error || json.reply || undefined);
          enqueue({ type: 'error', message: msg, code: json.code || 'HUB_ERROR' });
          latencyTrace.setPath('stream-error');
          finalizeWidgetChatTrace(latencyTrace, { ok: false, errorCode: json.code || 'HUB_ERROR' });
          controller.close();
          return;
        }

        let fullReply = json.reply || json.response || json.text || '';
        if (multiAgentMeta?.handoff && fullReply) {
          const prefix = buildHandoffPrefix(orchestratorName, multiAgentMeta.routedAgentName);
          if (!fullReply.startsWith(prefix)) fullReply = prefix + fullReply;
        }

        logWidgetFlow('✅', 'stream:done', 'respuesta hub para SSE', {
          traceId,
          status: res.status,
          replyLen: fullReply.length,
          toolsUsed: json.toolsUsed || [],
          mcpTag: typeof json.mcpTag === 'string' ? json.mcpTag : undefined,
        });

        const mcpTag =
          typeof json.mcpTag === 'string' && json.mcpTag.trim() ? json.mcpTag.trim() : undefined;
        const images = Array.isArray(json.images) && json.images.length ? json.images : undefined;
        const usedModel =
          typeof json.usedModel === 'string' && json.usedModel.trim() ? json.usedModel.trim() : undefined;
        await latencyTrace.span('reveal', () => emitStreamTokensFromText(enqueue, fullReply));
        // Mismas 4 condiciones que antes tenía el guardado (anidadas más abajo,
        // lejos del enqueue del done) — se evalúan acá para que emitDoneAndPersist
        // sea el único lugar que decide "responder + (tal vez) persistir".
        const hubProxyPersistInput =
          widgetToken.startsWith('wt_') && parsedAgentId && faqTrackOwnerId && fullReply && resolvedWidgetId
            ? {
                widgetId: resolvedWidgetId,
                userId: faqTrackOwnerId,
                agentId: parsedAgentId,
                sessionId: parsedSessionId || traceId,
                traceId,
                userMessage: userDisplayMessage || streamMsg,
                assistantMessage: fullReply,
                enrichment: imageEnrichment,
                toolsUsed: json.toolsUsed,
              }
            : null;
        emitDoneAndPersist(
          enqueue,
          attachAssistNavToPayload(
            {
              type: 'done',
              reply: fullReply,
              agentId: json.agentId || hubAgentId || parsedAgentIdLocal,
              toolsUsed: json.toolsUsed || [],
              streamed: true,
              ...(multiAgentMeta ? { multiAgent: multiAgentMeta } : {}),
              ...(mcpTag ? { mcpTag } : {}),
              ...(images ? { images } : {}),
              ...(usedModel ? { usedModel } : {}),
            },
            isAssistWidget,
            fullReply,
            assistNavCtx,
          ),
          hubProxyPersistInput,
        );

        latencyTrace.setPath('stream-hub');
        logStreamOpsMetric({
          userId: faqTrackOwnerId,
          agentId: json.agentId || hubAgentId || parsedAgentIdLocal,
          widgetId: resolvedWidgetId,
          sessionId: parsedSessionId || traceId,
          traceId,
          path: 'stream-hub',
          reply: fullReply,
          toolsUsed: json.toolsUsed,
          model: usedModel,
          inputTokens: json.usage?.inputTokens ?? null,
          outputTokens: json.usage?.outputTokens ?? null,
        });
        finalizeWidgetChatTrace(latencyTrace, {
          ok: true,
          replyLen: fullReply.length,
          toolsUsed: json.toolsUsed,
          inputTokens: json.usage?.inputTokens ?? null,
        });

        // Telemetry (non-blocking) — el guardado del transcript ya se resolvió
        // arriba, en el mismo emitDoneAndPersist que emite el evento `done`.
        if (widgetToken.startsWith('wt_') && parsedAgentId) {
          void trackWidgetChatUsage(widgetToken, parsedAgentId, true, json.usage, meteringInput).catch(() => {});
          if (faqTrackOwnerId) {
            void trackWidgetUserMessageForFaqCandidates({
              ownerUserId: faqTrackOwnerId,
              agentIdOrHubId: parsedAgentId,
              rawBody,
              agentReply: fullReply,
            }).catch(() => {});
          }
        }

        // A/B metrics: record session for the variant (single message = 1 session unit)
        if (activeVariantId && parsedAgentIdLocal) {
          void fetch(
            `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/agents/${parsedAgentIdLocal}/ab-tests/metrics`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ variantId: activeVariantId }),
            },
          ).catch(() => {});
        }
      } catch (err) {
        const formatted = formatHubFetchError(err, base);
        enqueue({
          type: 'error',
          message: formatted.message,
          code: formatted.code,
          ...(formatted.hint ? { hint: formatted.hint } : {}),
          ...(formatted.details ? { details: formatted.details } : {}),
        });
        latencyTrace.setPath('stream-error');
        finalizeWidgetChatTrace(latencyTrace, { ok: false, errorCode: formatted.code });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...corsHeaders(origin),
    },
  });
}
