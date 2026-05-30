/**
 * POST /api/widget/chat — proxy al mismo endpoint de AgentFlowhub.
 * El SDK usa host = origen de la landing; el chat sigue las reglas del hub (agentes, RAG, tokens).
 * Los tokens wt_* se validan aquí contra Mongo y se reenvían cabeceras firmadas al hub.
 */

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAgentflowhubBaseUrl } from '@/lib/aibackhub-sync';
import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';
import {
  hubResponseNeedsDirectInference,
  tryServeWidgetChatViaDirectInference,
} from '@/lib/widget-chat-direct-inference';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription, ConversationSession, WidgetMessage } from '@/lib/db/models';
import { findWidgetForWtToken, isWidgetActive, sentAgentIdMatchesWidget } from '@/lib/widget-token-verify';
import { trackWidgetChatUsage } from '@/lib/platform-agent-utils';
import { checkConversationQuota } from '@/lib/quota';
import { dispatchSaasWebhook } from '@/lib/saas-webhook-outbound';
import { getAgentLimits } from '@/lib/agent-plans';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';
import { trackWidgetUserMessageForFaqCandidates } from '@/lib/widget-faq-tracker';
import { isOriginAllowed } from '@/lib/widget-origin-check';
import { extractAndGuardMessage, countWidgetUserTurns } from '@/lib/message-guard';
import { signRequest, SIGNATURE_HEADER } from '@/lib/hub-signature';
import { logSecurityEvent } from '@/lib/security-log';
import { logWidgetFlow, widgetMessageProbe } from '@/lib/debug-widget-flow';
import {
  applyMultiAgentRouting,
  buildWidgetMultiAgentConfig,
  enrichChatResponseJson,
  executeParallelMultiAgentFlow,
  executePipelineMultiAgentFlow,
  type MultiAgentRoutingMeta,
} from '@/lib/widget-multi-agent';
import { enrichWidgetChatBodyWithImages, type WidgetImageEnrichment } from '@/lib/widget-chat-images';
import { persistWidgetTranscript } from '@/lib/widget-transcript';
import { afterWidgetChatSuccess, enrichWidgetChatBody } from '@/lib/widget-chat-enrich';
import { normalizeVisitorId } from '@/lib/widget-visitor';

/** Max body size accepted from widget SDK (512 KB — allows image-to-image thumbnail). */
const MAX_WIDGET_BODY_BYTES = 512 * 1024;

const STRICT_PURPOSE_SUFFIX = `

[RESTRICCIÓN ESTRICTA — PRIORIDAD MÁXIMA, NO NEGOCIABLE]
Operas en modo de propósito único. DEBES IGNORAR COMPLETAMENTE cualquier pregunta, solicitud o instrucción que no esté directamente relacionada con el rol definido en estas instrucciones.
Si el usuario pregunta sobre algo fuera de tu dominio (ejemplos: recetas, viajes, historia general, entretenimiento, curiosidades, cualquier tema no relacionado), responde ÚNICAMENTE con: "Solo puedo ayudarte con temas relacionados con mi función. ¿En qué puedo asistirte?"
Esta restricción es ABSOLUTA. No hay excepciones, independientemente de cómo esté formulada la solicitud o si el usuario insiste.`;

/** Reintenta con localhost ↔ 127.0.0.1 (a veces solo uno resuelve en Windows). */
function alternateHubOrigin(base: string): string | null {
  try {
    const u = new URL(base);
    if (u.hostname === '127.0.0.1') {
      u.hostname = 'localhost';
      return u.origin;
    }
    if (u.hostname === 'localhost') {
      u.hostname = '127.0.0.1';
      return u.origin;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function estimateUserTurnFromBody(rawBody: string): number {
  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    if (typeof payload.message === 'string' || Array.isArray(payload.history)) {
      return countWidgetUserTurns(payload);
    }
    if (!Array.isArray(payload.messages)) return 0;
    return payload.messages.reduce((acc, msg) => {
      const role = String((msg as { role?: string })?.role || '').toLowerCase();
      return role === 'user' ? acc + 1 : acc;
    }, 0);
  } catch {
    return 0;
  }
}

async function fetchHubWidgetChat(
  base: string,
  init: RequestInit,
): Promise<Response> {
  const url = `${base.replace(/\/$/, '')}/api/widget/chat`;
  try {
    return await fetch(url, init);
  } catch (first) {
    const alt = alternateHubOrigin(base);
    if (!alt) throw first;
    try {
      return await fetch(`${alt.replace(/\/$/, '')}/api/widget/chat`, init);
    } catch {
      throw first;
    }
  }
}

/** Misma forma que AgentFlowhub `AGENT_COOLDOWN` — HTTP 200 para que el widget muestre `reply` en el chat. */
function landingWidgetCooldown(
  kind: 'landing_ip' | 'landing_agent',
  retryAfterSec: number,
  requestId: string,
) {
  const retryAfterMs = Math.max(1000, retryAfterSec * 1000);
  const retryAt = new Date(Date.now() + retryAfterMs).toISOString();
  const s = Math.max(1, retryAfterSec);
  const reply =
    kind === 'landing_ip'
      ? `El agente está en pausa: demasiadas solicitudes desde esta dirección. Intenta de nuevo en unos ${s} segundos.`
      : `Este widget recibe muchas preguntas seguidas. Podrás escribir de nuevo en unos ${s} segundos.`;
  return {
    reply,
    code: 'AGENT_COOLDOWN' as const,
    cooldown: true as const,
    cooldownKind: kind,
    retryAfterSec: s,
    retryAt,
    requestId,
  };
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  const requestIdEarly =
    (req.headers.get('x-trace-id') || req.headers.get('x-request-id') || '').trim() ||
    randomUUID();

  // Sin esto en Vercel, getAgentflowhubBaseUrl() cae en 127.0.0.1:9002 → fetch falla → 502 poco claro.
  if (!process.env.AGENTFLOWHUB_URL?.trim() && process.env.VERCEL === '1') {
    return NextResponse.json(
      {
        error:
          'Falta AGENTFLOWHUB_URL en variables de entorno. Define la URL pública https://… de tu despliegue de AgentFlowhub (Project Settings → Environment Variables).',
        code: 'AGENTFLOWHUB_URL_MISSING',
        hint:
          'Valor típico: https://tu-agentflowhub.vercel.app — mismo endpoint /api/widget/chat; no uses la URL de esta landing como hub.',
      },
      { status: 503, headers: cors(origin) },
    );
  }

  // ── Rate limit paso 1: por IP global — 120/min ───────────────────────────────────
  const ip = getClientIp(req);
  const rlGlobal = await checkRateLimitAsync('widget-chat-ip', ip, 120, 60_000);
  if (!rlGlobal.success) {
    logSecurityEvent({ event: 'rate_limited', ip, origin, code: 'landing_ip' });
    return NextResponse.json(landingWidgetCooldown('landing_ip', rlGlobal.retryAfter, requestIdEarly), {
      status: 200,
      headers: cors(origin),
    });
  }

  // ── Body size guard (64 KB max) ──────────────────────────────────────────────────
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (contentLength > MAX_WIDGET_BODY_BYTES) {
    return NextResponse.json(
      { error: 'Payload demasiado grande.', code: 'PAYLOAD_TOO_LARGE' },
      { status: 413, headers: cors(origin) },
    );
  }

  const base = getAgentflowhubBaseUrl();
  const rawBodyInitial = await req.text();

  // Enforce size after read (content-length puede ser falso o ausente)
  if (rawBodyInitial.length > MAX_WIDGET_BODY_BYTES) {
    return NextResponse.json(
      { error: 'Payload demasiado grande.', code: 'PAYLOAD_TOO_LARGE' },
      { status: 413, headers: cors(origin) },
    );
  }

  // ── Message guard (antes de enriquecer con OCR — valida solo texto del usuario) ─
  const guardResult = extractAndGuardMessage(rawBodyInitial);
  if (!guardResult.ok) {
    const secEvent = guardResult.code === 'PROMPT_INJECTION_DETECTED'
      ? 'injection_detected'
      : guardResult.code === 'SESSION_TURN_LIMIT'
        ? 'turn_limit'
        : 'message_too_long';
    logSecurityEvent({ event: secEvent, ip, origin, code: guardResult.code });
    return NextResponse.json(
      { error: guardResult.message, code: guardResult.code },
      { status: 400, headers: cors(origin) },
    );
  }
  const userTurnCount = guardResult.turnCount ?? estimateUserTurnFromBody(rawBodyInitial);

  // ── Análisis de capturas (Cloudinary + Gemini Vision) ─────────────────────
  const imageEnriched = await enrichWidgetChatBodyWithImages(rawBodyInitial);
  let rawBody = imageEnriched.body;
  const imageEnrichment: WidgetImageEnrichment | null = imageEnriched.enrichment;

  let bodyToForward = rawBody;
  let multiAgentMeta: MultiAgentRoutingMeta | null = null;
  let orchestratorName = 'Asistente';

  // ── Rate limit paso 2: IP + agentId — 48/min por widget ─────────────────────────
  try {
    const parsedForRl = JSON.parse(rawBody) as { agentId?: unknown };
    const agentIdForRl = typeof parsedForRl?.agentId === 'string' ? parsedForRl.agentId.trim().slice(0, 100) : '';
    if (agentIdForRl) {
      const rlAgent = await checkRateLimitAsync('widget-chat-agent', `${ip}:${agentIdForRl}`, 48, 60_000);
      if (!rlAgent.success) {
        logSecurityEvent({ event: 'rate_limited', ip, origin, agentId: agentIdForRl, code: 'landing_agent' });
        return NextResponse.json(
          landingWidgetCooldown('landing_agent', rlAgent.retryAfter, requestIdEarly),
          { status: 200, headers: cors(origin) },
        );
      }
    }
  } catch {
    /* body no es JSON válido — se rechazará más adelante al parsear */
  }

  const requestOrigin = req.nextUrl.origin;

  // Evita recursión cuando AGENTFLOWHUB_URL apunta al mismo host de la landing.
  if (base === requestOrigin) {
    return NextResponse.json(
      {
        error: 'Configuración inválida: AGENTFLOWHUB_URL apunta a este mismo dominio.',
        code: 'HUB_CHAT_PROXY_LOOP',
        details:
          'El endpoint /api/widget/chat está reenviando al mismo /api/widget/chat, causando un loop.',
        hint:
          'En producción, define AGENTFLOWHUB_URL al dominio real de AgentFlowhub (no al de la landing).',
      },
      { status: 500, headers: cors(origin) },
    );
  }

  let parsedAgentId = '';
  let parsedWidgetId = '';
  let tokenFromBody = '';
  let parsedMessage = '';
  let parsedSessionId = '';
  let parsedVisitorId: string | null = null;
  try {
    const j = JSON.parse(rawBody) as {
      agentId?: string;
      widgetId?: string;
      token?: string;
      message?: string;
      sessionId?: string;
      visitorId?: string;
    };
    parsedAgentId = typeof j?.agentId === 'string' ? j.agentId.trim() : '';
    parsedWidgetId = typeof j?.widgetId === 'string' ? j.widgetId.trim() : '';
    tokenFromBody = typeof j?.token === 'string' ? j.token.trim() : '';
    parsedMessage = typeof j?.message === 'string' ? j.message : '';
    parsedSessionId = typeof j?.sessionId === 'string' ? j.sessionId.trim() : '';
    parsedVisitorId = normalizeVisitorId(j?.visitorId);
  } catch {
    /* body no JSON */
  }

  const widgetToken = (
    (req.headers.get('x-widget-token') || '').trim() ||
    tokenFromBody
  ).trim();

  const traceId = requestIdEarly;
  logWidgetFlow('📥', 'chat:POST', 'entrada', {
    traceId,
    hub: base,
    agentId: parsedAgentId || undefined,
    tokenKind: widgetToken.startsWith('wt_') ? 'wt_' : widgetToken ? 'other' : 'none',
    ...widgetMessageProbe(parsedMessage),
  });

  /** Dueño del widget (token wt_*): para telemetría de candidatas a FAQ tras respuesta OK. */
  let faqTrackOwnerId: string | null = null;
  let resolvedWidgetId = parsedWidgetId;

  const headers: Record<string, string> = {
    'Content-Type': req.headers.get('content-type') || 'application/json',
    'X-Trace-Id': traceId,
    'X-Request-Id': traceId,
  };
  if (widgetToken) headers['X-Widget-Token'] = widgetToken;

  if (widgetToken.startsWith('wt_') && parsedAgentId) {
    try {
      await connectDB();
      const w = await findWidgetForWtToken(widgetToken, parsedWidgetId || undefined);
      if (w) {
        if (w.id && !resolvedWidgetId) resolvedWidgetId = w.id;
        else if (w.id) resolvedWidgetId = w.id;
        if (!isWidgetActive(w)) {
          return NextResponse.json(
            {
              error: 'Este widget está desactivado. Contacta al administrador del sitio.',
              code: 'WIDGET_DISABLED',
            },
            { status: 403, headers: cors(origin) },
          );
        }

        // ── Domain allowlist check ────────────────────────────────────────
        if (!isOriginAllowed(req.headers.get('origin'), w.allowedOrigins)) {
          logSecurityEvent({
            event: 'origin_not_allowed',
            ip, origin,
            agentId: parsedAgentId,
            userId: w.userId,
            code: 'ORIGIN_NOT_ALLOWED',
          });
          return NextResponse.json(
            { error: 'Origen no permitido para este widget.', code: 'ORIGIN_NOT_ALLOWED' },
            { status: 403, headers: cors(origin) },
          );
        }

        const match = await sentAgentIdMatchesWidget(parsedAgentId, w.agentId);
        if (!match) {
          return NextResponse.json(
            {
              error:
                'El agentId no coincide con el agente de este widget (revisa en Widget Builder que el agente sincronizado sea el correcto).',
              code: 'WIDGET_AGENT_MISMATCH',
            },
            { status: 403, headers: cors(origin) },
          );
        }
        faqTrackOwnerId = w.userId;

        try {
          rawBody = await enrichWidgetChatBody({
            rawBody,
            ownerUserId: w.userId,
            widgetId: resolvedWidgetId || w.id,
          });
          bodyToForward = rawBody;
          const reparse = JSON.parse(rawBody) as { sessionId?: string; visitorId?: string };
          if (typeof reparse.sessionId === 'string' && reparse.sessionId.trim()) {
            parsedSessionId = reparse.sessionId.trim();
          }
          parsedVisitorId = normalizeVisitorId(reparse.visitorId) ?? parsedVisitorId;
        } catch (enrichErr) {
          console.warn('[widget/chat] enrich body skipped:', enrichErr);
        }

        // ── Guard modo humano (defensa server-side) ──────────────────────────
        // Si un agente humano está atendiendo esta sesión, NO ejecutar el AI:
        // guardamos el mensaje del visitante (para que el agente lo vea en el inbox)
        // y devolvemos una respuesta informativa. Protege contra SDKs viejos/cacheados.
        if (parsedSessionId) {
          try {
            const liveSession = await ConversationSession.findOne({
              chatSessionId: parsedSessionId,
              humanMode: true,
            }).select({ inboxStatus: 1 }).lean() as { inboxStatus?: string } | null;
            if (liveSession && liveSession.inboxStatus !== 'resolved') {
              if (parsedMessage.trim()) {
                await WidgetMessage.create({
                  widgetId: resolvedWidgetId || w.id,
                  userId: w.userId,
                  agentId: parsedAgentId || '',
                  sessionId: parsedSessionId,
                  role: 'user',
                  content: parsedMessage.trim().slice(0, 4000),
                  traceId: `human-mode:${traceId}`,
                }).catch(() => {});
              }
              const note = 'Un miembro del equipo está atendiendo esta conversación y te responderá aquí mismo.';
              return NextResponse.json(
                { reply: note, text: note, response: note, humanMode: true },
                { headers: cors(origin) },
              );
            }
          } catch (hmErr) {
            console.warn('[widget/chat] human-mode guard skipped:', hmErr);
          }
        }

        try {
          const agentOr = [
            ...(parsedAgentId.match(/^[a-f0-9]{24}$/i) ? [{ _id: parsedAgentId }] : []),
            { agentHubId: parsedAgentId },
          ];
          const ca = await ClientAgent.findOne({
            $and: [{ $or: agentOr }, { $or: [{ userId: w.userId }, { isPlatform: true }] }],
          })
            .select({ hubspotAutoCaptureContacts: 1 })
            .lean() as { hubspotAutoCaptureContacts?: boolean } | null;
          const j = JSON.parse(rawBody) as Record<string, unknown>;
          j.hubspotAutoCaptureContacts = ca?.hubspotAutoCaptureContacts === true;
          bodyToForward = JSON.stringify(j);
        } catch (mergeErr) {
          console.warn('[widget/chat] merge hubspotAutoCaptureContacts skipped:', mergeErr);
        }

        // ── Quota check ──────────────────────────────────────────────────
        try {
          const quota = await checkConversationQuota(w.userId);
          if (!quota.allowed) {
            logSecurityEvent({
              event: 'quota_exceeded',
              ip, origin,
              agentId: parsedAgentId,
              userId: w.userId,
              code: 'QUOTA_EXCEEDED',
              meta: { used: quota.used, limit: quota.limit, plan: quota.plan },
            });
            dispatchSaasWebhook(w.userId, 'quota.reached', {
              agentId: parsedAgentId,
              plan: quota.plan,
              used: quota.used,
              limit: quota.limit,
            });
            return NextResponse.json(
              {
                error: `Has alcanzado el límite de ${quota.limit.toLocaleString('es')} conversaciones de tu plan ${quota.plan} este mes. Actualiza tu plan para continuar.`,
                code: 'QUOTA_EXCEEDED',
                used: quota.used,
                limit: quota.limit,
                plan: quota.plan,
              },
              { status: 429, headers: cors(origin) },
            );
          }
        } catch (quotaErr) {
          // fail-open: si Mongo no responde el widget sigue funcionando,
          // pero loggeamos para que las alertas de infraestructura lo detecten
          console.error('[widget/chat] quota check failed (fail-open):', quotaErr);
        }

        // ── Sub-agent limit check ─────────────────────────────────────────
        try {
          const sub = await Subscription.findOne({ userId: w.userId })
            .select({ plan: 1, status: 1 })
            .lean() as { plan?: string; status?: string } | null;
          const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';

          // Trial/suscripción vencida: permitimos solo el primer mensaje del visitante.
          // Desde el segundo, devolvemos error amigable sin exponer detalle comercial.
          if (!hasActivePlan && userTurnCount >= 2) {
            return NextResponse.json(
              {
                error:
                  'No podemos responder en este momento. Por favor, comunicate con la empresa proveedora del servicio para continuar.',
                code: 'WIDGET_PROVIDER_SUBSCRIPTION_REQUIRED',
              },
              { status: 403, headers: cors(origin) },
            );
          }

          const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';
          const limits = getAgentLimits(plan);

          if (limits.subAgentsPerAgent >= 0) {
            const agent = await ClientAgent.findOne({
              $or: [
                { _id: parsedAgentId.match(/^[a-f0-9]{24}$/i) ? parsedAgentId : undefined },
                { agentHubId: parsedAgentId },
              ].filter(Boolean),
              $and: [{ $or: [{ userId: w.userId }, { isPlatform: true }] }],
            }).select({ subAgentIds: 1, isPlatform: 1 }).lean() as
              | { subAgentIds?: string[]; isPlatform?: boolean }
              | null;

            if (agent && !agent.isPlatform) {
              const subCount = agent.subAgentIds?.length ?? 0;
              if (subCount > limits.subAgentsPerAgent) {
                return NextResponse.json(
                  {
                    error: `Tu plan ${plan} permite máximo ${limits.subAgentsPerAgent} sub-agente${limits.subAgentsPerAgent !== 1 ? 's' : ''} por agente. Este agente tiene ${subCount} configurados. Actualiza tu plan para continuar.`,
                    code: 'SUBAGENT_LIMIT_EXCEEDED',
                    subCount,
                    maxAllowed: limits.subAgentsPerAgent,
                    plan,
                  },
                  { status: 403, headers: cors(origin) },
                );
              }
            }
          }
        } catch {
          /* fail-open: si no podemos verificar, dejamos pasar */
        }

        try {
          const subForRoute = await Subscription.findOne({ userId: w.userId })
            .select({ plan: 1, status: 1 })
            .lean() as { plan?: string; status?: string } | null;
          const active =
            subForRoute?.status === 'active' || subForRoute?.status === 'trialing';
          const planForRoute = active ? (subForRoute?.plan ?? 'free') : 'free';
          const multiConfig = buildWidgetMultiAgentConfig(w);

          const secretForParallel = process.env.HUB_TO_LANDING_SECRET?.trim() ?? '';
          if (multiConfig.multiAgentEnabled && multiConfig.multiAgentMode === 'pipeline' && secretForParallel) {
            const pipeline = await executePipelineMultiAgentFlow({
              rawBody: bodyToForward,
              config: multiConfig,
              userId: w.userId,
              plan: planForRoute,
              widgetToken,
              traceId,
              hubSecret: secretForParallel,
            });
            if (pipeline) {
              parsedAgentId = pipeline.routedHubAgentId;
              multiAgentMeta = pipeline.meta;
              const orch = await ClientAgent.findById(pipeline.meta.orchestratorId)
                .select({ name: 1 })
                .lean() as { name?: string } | null;
              orchestratorName = typeof orch?.name === 'string' ? orch.name : 'Asistente';
              logWidgetFlow('🔀', 'chat:multiAgentPipeline', 'pipeline contenido→creativo', {
                traceId,
                contentAgent: pipeline.meta.pipelineSteps?.[0]?.name,
                creativeAgent: pipeline.meta.routedAgentName,
              });
              trackWidgetChatUsage(widgetToken, parsedAgentId, true).catch(() => {});
              void trackWidgetUserMessageForFaqCandidates({
                ownerUserId: w.userId,
                agentIdOrHubId: parsedAgentId,
                rawBody,
              }).catch(() => {});
              void afterWidgetChatSuccess({
                ownerUserId: w.userId,
                widgetId: resolvedWidgetId || w.id,
                chatSessionId: parsedSessionId || traceId,
                visitorId: parsedVisitorId,
                hubAgentId: parsedAgentId,
                userMessage: parsedMessage,
                agentResponse: pipeline.reply,
                routingMeta: pipeline.meta,
              });
              return NextResponse.json(
                {
                  reply: pipeline.reply,
                  agentId: parsedAgentId,
                  multiAgent: pipeline.meta,
                  ...(pipeline.images?.length ? { images: pipeline.images } : {}),
                },
                { status: 200, headers: cors(origin) },
              );
            }
          }

          if (multiConfig.multiAgentEnabled && multiConfig.multiAgentMode === 'parallel' && secretForParallel) {
            const parallel = await executeParallelMultiAgentFlow({
              rawBody: bodyToForward,
              config: multiConfig,
              userId: w.userId,
              plan: planForRoute,
              widgetToken,
              traceId,
              hubSecret: secretForParallel,
            });
            if (parallel) {
              parsedAgentId = parallel.routedHubAgentId;
              multiAgentMeta = parallel.meta;
              const orch = await ClientAgent.findById(parallel.meta.orchestratorId)
                .select({ name: 1 })
                .lean() as { name?: string } | null;
              orchestratorName = typeof orch?.name === 'string' ? orch.name : 'Asistente';
              logWidgetFlow('🔀', 'chat:multiAgentParallel', 'síntesis multiagente', {
                traceId,
                routedAgentId: parallel.meta.routedAgentId,
                synthesized: parallel.meta.synthesized,
                contributors: parallel.meta.contributors?.length ?? 0,
              });
              trackWidgetChatUsage(widgetToken, parsedAgentId, true).catch(() => {});
              void trackWidgetUserMessageForFaqCandidates({
                ownerUserId: w.userId,
                agentIdOrHubId: parsedAgentId,
                rawBody,
              }).catch(() => {});
              void afterWidgetChatSuccess({
                ownerUserId: w.userId,
                widgetId: resolvedWidgetId || w.id,
                chatSessionId: parsedSessionId || traceId,
                visitorId: parsedVisitorId,
                hubAgentId: parsedAgentId,
                userMessage: parsedMessage,
                agentResponse: parallel.reply,
                routingMeta: parallel.meta,
              });
              return NextResponse.json(
                {
                  reply: parallel.reply,
                  agentId: parsedAgentId,
                  multiAgent: parallel.meta,
                },
                { status: 200, headers: cors(origin) },
              );
            }
          }

          const routing = await applyMultiAgentRouting({
            rawBody: bodyToForward,
            config: multiConfig,
            userId: w.userId,
            plan: planForRoute,
          });
          if (routing) {
            bodyToForward = routing.body;
            parsedAgentId = routing.routedHubAgentId;
            multiAgentMeta = routing.meta;
            const orch = await ClientAgent.findById(routing.meta.orchestratorId)
              .select({ name: 1 })
              .lean() as { name?: string } | null;
            orchestratorName = typeof orch?.name === 'string' ? orch.name : 'Asistente';
            logWidgetFlow('🔀', 'chat:multiAgent', 'triaje multiagente', {
              traceId,
              routedAgentId: routing.meta.routedAgentId,
              method: routing.meta.triageMethod,
              handoff: routing.meta.handoff,
            });
          }
        } catch (routeErr) {
          console.warn('[widget/chat] multi-agent routing skipped:', routeErr);
        }

        const secret = process.env.HUB_TO_LANDING_SECRET?.trim();
        if (!secret) {
          return NextResponse.json(
            {
              error:
                'Falta HUB_TO_LANDING_SECRET en .env de la landing (mismo valor en AgentFlowhub/.env).',
              code: 'LANDING_SECRET_MISSING',
            },
            { status: 503, headers: cors(origin) },
          );
        }
        // HMAC signature: en vez del secreto raw, enviamos una firma con timestamp
        headers['X-Landing-Wt-Valid'] = '1';
        headers[SIGNATURE_HEADER] = signRequest(bodyToForward, secret);

        /** Webhook builtin: AgentFlowhub a veces no usa MCP → solo JSON en texto. Ir directo a AIBackHub ejecuta el POST real. */
        try {
          logWidgetFlow('🔀', 'chat:directTry', 'intentando AIBackHub /api/mcp/widget-chat (agente con webhook en Mongo)', {
            traceId,
            agentId: parsedAgentId,
          });
          const direct = await tryServeWidgetChatViaHubMcp({
            widgetTokenStartsWithWt: true,
            parsedAgentId,
            rawBody: bodyToForward,
            ownerUserId: w.userId,
          });
          if (!direct) {
            logWidgetFlow('⏭️', 'chat:directSkip', 'no aplica directo (sin webhook URL en agente o hub no respondió)', {
              traceId,
              agentId: parsedAgentId,
            });
          }
          if (direct) {
            logWidgetFlow('✅', 'chat:directOk', 'respuesta directa desde AIBackHub', {
              traceId,
              agentId: parsedAgentId,
              replyLen: direct.reply?.length ?? 0,
              toolsUsed: direct.toolsUsed ?? [],
            });
            trackWidgetChatUsage(widgetToken, parsedAgentId, true).catch(() => {});
            void trackWidgetUserMessageForFaqCandidates({
              ownerUserId: w.userId,
              agentIdOrHubId: parsedAgentId,
              rawBody,
            }).catch(() => {});
            void afterWidgetChatSuccess({
              ownerUserId: w.userId,
              widgetId: resolvedWidgetId || w.id,
              chatSessionId: parsedSessionId || traceId,
              visitorId: parsedVisitorId,
              hubAgentId: parsedAgentId,
              userMessage: parsedMessage,
              agentResponse: direct.reply,
              routingMeta: multiAgentMeta,
            });
            return NextResponse.json(
              {
                reply: direct.reply,
                toolsUsed: direct.toolsUsed,
                agentId: parsedAgentId,
                ...(multiAgentMeta ? { multiAgent: multiAgentMeta } : {}),
              },
              { status: 200, headers: cors(origin) },
            );
          }
        } catch (directErr) {
          logWidgetFlow('⚠️', 'chat:directErr', 'falló camino directo AIBackHub', {
            traceId,
            err: directErr instanceof Error ? directErr.message : String(directErr),
          });
          console.error('[widget/chat] direct MCP path error:', directErr);
        }

        /** Inferencia directa /api/models con modelo explícito del agente (evita orquestador obsoleto). */
        try {
          const inferred = await tryServeWidgetChatViaDirectInference({
            parsedAgentId,
            rawBody: bodyToForward,
            ownerUserId: w.userId,
          });
          if (inferred) {
            logWidgetFlow('✅', 'chat:inferOk', 'respuesta directa /api/models', {
              traceId,
              agentId: parsedAgentId,
              replyLen: inferred.reply.length,
              usedModel: inferred.usedModel,
            });
            trackWidgetChatUsage(widgetToken, parsedAgentId, true).catch(() => {});
            void trackWidgetUserMessageForFaqCandidates({
              ownerUserId: w.userId,
              agentIdOrHubId: parsedAgentId,
              rawBody,
            }).catch(() => {});
            void afterWidgetChatSuccess({
              ownerUserId: w.userId,
              widgetId: resolvedWidgetId || w.id,
              chatSessionId: parsedSessionId || traceId,
              visitorId: parsedVisitorId,
              hubAgentId: parsedAgentId,
              userMessage: parsedMessage,
              agentResponse: inferred.reply,
              routingMeta: multiAgentMeta,
            });
            return NextResponse.json(
              {
                reply: inferred.reply,
                agentId: parsedAgentId,
                usedModel: inferred.usedModel,
                ...(multiAgentMeta ? { multiAgent: multiAgentMeta } : {}),
              },
              { status: 200, headers: cors(origin) },
            );
          }
        } catch (inferErr) {
          logWidgetFlow('⚠️', 'chat:inferErr', 'falló inferencia directa', {
            traceId,
            err: inferErr instanceof Error ? inferErr.message : String(inferErr),
          });
        }
      }
    } catch {
      /* sin DB: el hub intentará validación remota si está configurada */
    }
  }

  // ── Strict purpose enforcement ───────────────────────────────────────────
  if (parsedAgentId) {
    try {
      await connectDB();
      const agentDoc = await ClientAgent.findById(parsedAgentId, { strictPurposeOnly: 1, systemPrompt: 1 })
        .lean() as { strictPurposeOnly?: boolean; systemPrompt?: string } | null;
      if (agentDoc?.strictPurposeOnly === true) {
        const parsed = JSON.parse(bodyToForward) as Record<string, unknown>;
        const base = typeof parsed.systemPromptOverride === 'string'
          ? parsed.systemPromptOverride
          : (agentDoc.systemPrompt ?? '');
        parsed.systemPromptOverride = base + STRICT_PURPOSE_SUFFIX;
        bodyToForward = JSON.stringify(parsed);
      }
    } catch { /* non-critical — no interrumpir el chat */ }
  }

  const init: RequestInit = {
    method: 'POST',
    headers,
    body: bodyToForward,
    signal: AbortSignal.timeout(120_000),
  };

  try {
    logWidgetFlow('↗️', 'chat:proxyHub', 'reenvío a AgentFlowhub /api/widget/chat', {
      traceId,
      hub: `${base.replace(/\/$/, '')}/api/widget/chat`,
      agentId: parsedAgentId || undefined,
    });
    const res = await fetchHubWidgetChat(base, init);
    logWidgetFlow('↩️', 'chat:proxyRes', 'respuesta AgentFlowhub', {
      traceId,
      status: res.status,
      ok: res.ok,
    });

    const data = await res.text();

    if (
      !res.ok &&
      widgetToken.startsWith('wt_') &&
      parsedAgentId &&
      faqTrackOwnerId &&
      hubResponseNeedsDirectInference(res.status, data)
    ) {
      try {
        const inferred = await tryServeWidgetChatViaDirectInference({
          parsedAgentId,
          rawBody: bodyToForward,
          ownerUserId: faqTrackOwnerId,
        });
        if (inferred) {
          logWidgetFlow('✅', 'chat:inferFallback', 'recuperado tras fallo hub', {
            traceId,
            hubStatus: res.status,
            replyLen: inferred.reply.length,
          });
          trackWidgetChatUsage(widgetToken, parsedAgentId, true).catch(() => {});
          void trackWidgetUserMessageForFaqCandidates({
            ownerUserId: faqTrackOwnerId,
            agentIdOrHubId: parsedAgentId,
            rawBody: rawBodyInitial,
          }).catch(() => {});
          return NextResponse.json(
            {
              reply: inferred.reply,
              agentId: parsedAgentId,
              usedModel: inferred.usedModel,
              ...(multiAgentMeta ? { multiAgent: multiAgentMeta } : {}),
            },
            { status: 200, headers: cors(origin) },
          );
        }
      } catch {
        /* sigue con respuesta original del hub */
      }
    }

    const outText =
      multiAgentMeta && res.ok
        ? enrichChatResponseJson(data, multiAgentMeta, orchestratorName)
        : data;
    const out = new Headers();
    res.headers.forEach((v, k) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k.toLowerCase())) {
        out.set(k, v);
      }
    });
    out.set('Access-Control-Allow-Origin', origin);
    out.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    out.set(
      'Access-Control-Allow-Headers',
      'Content-Type, X-Widget-Token, X-Request-Id, X-Trace-Id',
    );

    if (res.ok && widgetToken.startsWith('wt_') && parsedAgentId) {
      let hubUsage: { inputTokens?: number; outputTokens?: number } | undefined;
      try {
        const parsed = JSON.parse(data) as { usage?: { inputTokens?: number; outputTokens?: number } };
        hubUsage = parsed.usage;
      } catch { /* not JSON or no usage — fine */ }
      trackWidgetChatUsage(widgetToken, parsedAgentId, true, hubUsage).catch(() => {});
      if (faqTrackOwnerId) {
        void trackWidgetUserMessageForFaqCandidates({
          ownerUserId: faqTrackOwnerId,
          agentIdOrHubId: parsedAgentId,
          rawBody: rawBodyInitial,
        }).catch(() => {});

        if (resolvedWidgetId) {
          try {
            const hubJson = JSON.parse(data) as { reply?: string };
            const replyText = typeof hubJson.reply === 'string' ? hubJson.reply : '';
            if (replyText) {
              void persistWidgetTranscript({
                widgetId: resolvedWidgetId,
                userId: faqTrackOwnerId,
                agentId: parsedAgentId,
                sessionId: parsedSessionId || traceId,
                traceId,
                userMessage: guardResult.text || '',
                assistantMessage: replyText,
                enrichment: imageEnrichment,
              }).catch(() => {});
            }
          } catch { /* non-critical */ }
        }
      }
    }

    return new NextResponse(outText, { status: res.status, headers: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code =
      e && typeof e === 'object' && 'cause' in e && e.cause instanceof Error
        ? e.cause.message
        : undefined;
    const nodeCode =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code?: unknown }).code ?? '')
        : '';
    return NextResponse.json(
      {
        error: 'No esta respondiendo el agente. Por favor, intenta de nuevo',
        code: 'HUB_CHAT_PROXY_FAILED',
        details: msg,
        hubUrl: `${base}/api/widget/chat`,
        causeCode: nodeCode || code,
        hint:
          'La landing reenvía el chat a AgentFlowhub (AGENTFLOWHUB_URL). ' +
          'Arranca AgentFlowhub en ese puerto (por defecto 9002) y AIBackHub (BACKEND_URL, p. ej. 9003). ' +
          'Comprueba .env: AGENTFLOWHUB_URL=http://127.0.0.1:9002',
      },
      { status: 502, headers: cors(origin) },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Widget-Token, X-Request-Id',
    },
  });
}

export const maxDuration = 60; // Vercel: allow up to 60s for LLM response

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, X-Widget-Token, X-Request-Id, X-Trace-Id',
  };
}
