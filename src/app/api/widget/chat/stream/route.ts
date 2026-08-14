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
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';
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
  messageReferencesPriorImage,
} from '@/lib/widget-chat-vision-context';
import {
  loadSessionVisionEnrichment,
  persistSessionVisionAnalysis,
} from '@/lib/widget-session-context';
import { afterWidgetChatSuccess, enrichWidgetChatBody } from '@/lib/widget-chat-enrich';
import { schedulePersistWidgetTranscript } from '@/lib/widget-transcript';
import { agentHasAnyWebhook } from '@/lib/agent-webhooks';
import { tryServeWidgetChatViaDirectInference } from '@/lib/widget-chat-direct-inference';
import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';
import { normalizeVisitorId } from '@/lib/widget-visitor';
import {
  emitWidgetChatStatus,
  loadAgentStreamHints,
  type WidgetChatStreamHints,
} from '@/lib/widget-chat-status';
import { emitStreamTokensFromText } from '@/lib/widget-stream-reply';
import {
  finalizeWidgetChatTrace,
  WidgetChatTrace,
} from '@/lib/widget-chat-latency';
import { friendlyWidgetChatError } from '@/lib/widget-chat-user-errors';
import { attachAssistNavToPayload, buildAssistNavCtx } from '@/lib/assist-chat-reply';
import { isLocalDevLimitsBypass } from '@/lib/dev-limits';

export const maxDuration = 60; // Vercel: allow up to 60s for LLM + streaming

const MAX_WIDGET_BODY_BYTES = 512 * 1024;

const STRICT_PURPOSE_SUFFIX = `

[RESTRICCIÓN ESTRICTA — PRIORIDAD MÁXIMA, NO NEGOCIABLE]
Operas en modo de propósito único. DEBES IGNORAR COMPLETAMENTE cualquier pregunta, solicitud o instrucción que no esté directamente relacionada con el rol definido en estas instrucciones.
Si el usuario pregunta sobre algo fuera de tu dominio (ejemplos: recetas, viajes, historia general, entretenimiento, curiosidades, cualquier tema no relacionado), responde ÚNICAMENTE con: "Solo puedo ayudarte con temas relacionados con mi función. ¿En qué puedo asistirte?"
Esta restricción es ABSOLUTA. No hay excepciones, independientemente de cómo esté formulada la solicitud o si el usuario insiste.`;

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
  const rlGlobal = await checkRateLimitAsync('widget-chat-ip', ip, 120, 60_000);
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
  let prefetchedAgentHintsDoc: {
    skills?: string[];
    skillsConfig?: Array<{ id?: string; enabled?: boolean }>;
    ragEnabled?: boolean;
    enabledMcpToolIds?: string[];
    tools?: Array<{ toolId?: string }>;
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
        const agentFilter = /^[a-f0-9]{24}$/i.test(parsedAgentId)
          ? { _id: parsedAgentId }
          : { agentHubId: parsedAgentId };

        const [quota, subDoc, agentDoc] = await Promise.all([
          checkConversationQuota(w.userId),
          Subscription.findOne({ userId: w.userId })
            .select({ status: 1, plan: 1 })
            .lean() as Promise<{ status?: string; plan?: string } | null>,
          ClientAgent.findOne(agentFilter)
            .select({
              tools: 1,
              skills: 1,
              skillsConfig: 1,
              ragEnabled: 1,
              enabledMcpToolIds: 1,
            })
            .lean() as Promise<{
              tools?: Array<{ toolId?: string; config?: unknown }>;
              skills?: string[];
              skillsConfig?: Array<{ id?: string; enabled?: boolean }>;
              ragEnabled?: boolean;
              enabledMcpToolIds?: string[];
            } | null>,
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

        prefetchedAgentHintsDoc = agentDoc;

        // ── Multi-webhook detection — fuerza fallback al endpoint non-stream ──
        try {
          if (agentDoc && agentHasAnyWebhook(agentDoc)) {
            logWidgetFlow('🔀', 'stream:skip', 'agente con webhooks → forzando fallback non-stream', {
              traceId,
              agentId: parsedAgentId,
            });
            latencyTrace.mark('auth');
            finalizeWidgetChatTrace(latencyTrace, { ok: false, errorCode: 'STREAM_NOT_SUPPORTED' });
            return new Response(
              sseEvent({ type: 'error', message: 'stream_unavailable', code: 'STREAM_NOT_SUPPORTED' }),
              { status: 503, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
            );
          }
        } catch (e) {
          logWidgetFlow('⚠️', 'stream:webhookCheckErr', e instanceof Error ? e.message : String(e));
        }

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

        // Assist dashboard (Math-ais): contexto del usuario logueado (sin HubSpot).
        try {
          const {
            identityFromSessionCookie,
            injectAssistContextIntoChatBody,
            isInternalAppAssistWidget,
          } = await import('@/lib/assist-session-identity');
          const isAssist = await isInternalAppAssistWidget({
            widgetId: resolvedWidgetId || w.id,
            agentId: parsedAgentId,
          });
          if (isAssist) {
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
          }
        } catch (idErr) {
          console.warn('[widget/chat/stream] assist identity inject skipped:', idErr);
        }

        const visionWidgetId = resolvedWidgetId || w.id;
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
          messageReferencesPriorImage(guardResult.text || '')
        ) {
          try {
            activeVisionEnrichment = await loadSessionVisionEnrichment(
              visionWidgetId,
              parsedSessionId,
              w.userId,
              guardResult.text || '',
            );
          } catch {
            /* ignore */
          }
        }

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

      let streamHints: WidgetChatStreamHints | null = null;

      latencyTrace.setMeta({
        userId: faqTrackOwnerId,
        agentId: parsedAgentIdLocal || parsedAgentId,
        widgetId: resolvedWidgetId || parsedWidgetId,
        sessionId: parsedSessionId || traceId,
      });

      try {
        emitWidgetChatStatus(enqueue, 'prepare');
        if (faqTrackOwnerId) {
          emitWidgetChatStatus(enqueue, 'enrich');
        }
        if (imageEnrichment?.images?.length) {
          emitWidgetChatStatus(enqueue, 'vision');
        }

        if (multiAgentCtx) {
          if (multiAgentCtx.config.multiAgentEnabled) {
            emitWidgetChatStatus(enqueue, 'triage');
          }

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
              enqueue({
                type: 'done',
                reply: pipeline.reply,
                agentId: pipeline.routedHubAgentId,
                multiAgent: pipeline.meta,
                streamed: true,
                ...(pipeline.images?.length ? { images: pipeline.images } : {}),
              });
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
                schedulePersistWidgetTranscript({
                  widgetId: resolvedWidgetId,
                  userId: faqTrackOwnerId,
                  agentId: pipeline.routedHubAgentId,
                  sessionId: parsedSessionId || traceId,
                  traceId,
                  userMessage: userDisplayMessage || parsedMessage,
                  assistantMessage: pipeline.reply,
                  enrichment: imageEnrichment,
                });
              }
              latencyTrace.setPath('stream-pipeline');
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
              enqueue({
                type: 'done',
                reply: parallel.reply,
                agentId: parallel.routedHubAgentId,
                multiAgent: parallel.meta,
                streamed: true,
              });
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
                schedulePersistWidgetTranscript({
                  widgetId: resolvedWidgetId,
                  userId: faqTrackOwnerId,
                  agentId: parallel.routedHubAgentId,
                  sessionId: parsedSessionId || traceId,
                  traceId,
                  userMessage: userDisplayMessage || parsedMessage,
                  assistantMessage: parallel.reply,
                  enrichment: imageEnrichment,
                });
              }
              latencyTrace.setPath('stream-parallel');
              finalizeWidgetChatTrace(latencyTrace, { ok: true, replyLen: parallel.reply.length });
              return;
            }
          }

          const routing = await latencyTrace.span('multi_triage', () => applyMultiAgentRouting({
            rawBody: hubBody,
            config: multiAgentCtx.config,
            userId: multiAgentCtx.userId,
            plan: multiAgentCtx.plan,
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
              enqueue(
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
              );
              void trackWidgetChatUsage(widgetToken, parsedAgentIdLocal, true, undefined, meteringInput).catch(() => {});
              if (faqTrackOwnerId) {
                void trackWidgetUserMessageForFaqCandidates({
                  ownerUserId: faqTrackOwnerId,
                  agentIdOrHubId: parsedAgentIdLocal,
                  rawBody: rawBodyInitial,
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
                schedulePersistWidgetTranscript({
                  widgetId: resolvedWidgetId,
                  userId: faqTrackOwnerId,
                  agentId: parsedAgentIdLocal,
                  sessionId: parsedSessionId || traceId,
                  traceId,
                  userMessage: userDisplayMessage || parsedMessage,
                  assistantMessage: directMcp.reply,
                  enrichment: imageEnrichment,
                  toolsUsed: directMcp.toolsUsed,
                });
              }
              latencyTrace.setPath('stream-direct-mcp');
              finalizeWidgetChatTrace(latencyTrace, { ok: true, replyLen: directMcp.reply.length });
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
              enqueue(
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
              );
              void trackWidgetChatUsage(widgetToken, parsedAgentIdLocal, true, undefined, meteringInput).catch(() => {});
              if (faqTrackOwnerId) {
                void trackWidgetUserMessageForFaqCandidates({
                  ownerUserId: faqTrackOwnerId,
                  agentIdOrHubId: parsedAgentIdLocal,
                  rawBody: rawBodyInitial,
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
                schedulePersistWidgetTranscript({
                  widgetId: resolvedWidgetId,
                  userId: faqTrackOwnerId,
                  agentId: parsedAgentIdLocal,
                  sessionId: parsedSessionId || traceId,
                  traceId,
                  userMessage: userDisplayMessage || parsedMessage,
                  assistantMessage: inferredEarly.reply,
                  enrichment: imageEnrichment,
                });
              }
              latencyTrace.setPath('stream-infer-direct');
              finalizeWidgetChatTrace(latencyTrace, { ok: true, replyLen: inferredEarly.reply.length });
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

        try {
          streamHints = await latencyTrace.span('hints', () =>
            loadAgentStreamHints(parsedAgentIdLocal, faqTrackOwnerId, prefetchedAgentHintsDoc ?? undefined),
          );
          if (streamHints.hasSkills) {
            emitWidgetChatStatus(
              enqueue,
              'skills',
              streamHints.skillCount === 1 ? '1 habilidad' : `${streamHints.skillCount} habilidades`,
            );
          }
          if (streamHints.ragEnabled) {
            emitWidgetChatStatus(enqueue, 'rag');
          }
        } catch (hintsErr) {
          logWidgetFlow('⚠️', 'stream:hintsErr', hintsErr instanceof Error ? hintsErr.message : String(hintsErr));
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
              enqueue(
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
              );
              void trackWidgetChatUsage(widgetToken, parsedAgentIdLocal, true, undefined, meteringInput).catch(() => {});
              if (faqTrackOwnerId) {
                void trackWidgetUserMessageForFaqCandidates({
                  ownerUserId: faqTrackOwnerId,
                  agentIdOrHubId: parsedAgentIdLocal,
                  rawBody: rawBodyInitial,
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
                schedulePersistWidgetTranscript({
                  widgetId: resolvedWidgetId,
                  userId: faqTrackOwnerId,
                  agentId: parsedAgentIdLocal,
                  sessionId: parsedSessionId || traceId,
                  traceId,
                  userMessage: userDisplayMessage || parsedMessage,
                  assistantMessage: inferred.reply,
                  enrichment: imageEnrichment,
                });
              }
              latencyTrace.setPath('stream-infer-direct');
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
        if (streamHints?.hasMcpTools) {
          emitWidgetChatStatus(enqueue, 'mcp');
        } else if (streamHints?.hasWebhookTools) {
          emitWidgetChatStatus(enqueue, 'tools');
        }
        emitWidgetChatStatus(enqueue, 'hub');
        const res = await latencyTrace.span('hub', () =>
          fetchHubWidgetChat(base, {
            method: 'POST',
            headers,
            body: hubBody,
            signal: AbortSignal.timeout(120_000),
          }),
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
        emitWidgetChatStatus(enqueue, 'model');
        await latencyTrace.span('reveal', () => emitStreamTokensFromText(enqueue, fullReply));
        enqueue(
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
        );

        latencyTrace.setPath('stream-hub');
        finalizeWidgetChatTrace(latencyTrace, { ok: true, replyLen: fullReply.length });

        // Telemetry (non-blocking)
        if (widgetToken.startsWith('wt_') && parsedAgentId) {
          void trackWidgetChatUsage(widgetToken, parsedAgentId, true, json.usage, meteringInput).catch(() => {});
          if (faqTrackOwnerId) {
            void trackWidgetUserMessageForFaqCandidates({
              ownerUserId: faqTrackOwnerId,
              agentIdOrHubId: parsedAgentId,
              rawBody,
            }).catch(() => {});

            // Persist transcript (fire-and-forget — never blocks stream)
            if (fullReply && resolvedWidgetId) {
              schedulePersistWidgetTranscript({
                widgetId: resolvedWidgetId,
                userId: faqTrackOwnerId,
                agentId: parsedAgentId,
                sessionId: parsedSessionId || traceId,
                traceId,
                userMessage: userDisplayMessage || streamMsg,
                assistantMessage: fullReply,
                enrichment: imageEnrichment,
                toolsUsed: json.toolsUsed,
              });
            }
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
