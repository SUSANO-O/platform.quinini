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
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription } from '@/lib/db/models';
import { findWidgetForWtToken, sentAgentIdMatchesWidget } from '@/lib/widget-token-verify';
import { checkConversationQuota } from '@/lib/quota';
import { trackWidgetChatUsage } from '@/lib/platform-agent-utils';
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
  type MultiAgentRoutingMeta,
  type WidgetMultiAgentConfig,
} from '@/lib/widget-multi-agent';

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
  const traceId = (req.headers.get('x-trace-id') || req.headers.get('x-request-id') || '').trim() || randomUUID();

  const ip = getClientIp(req);
  const rlGlobal = await checkRateLimitAsync('widget-chat-ip', ip, 120, 60_000);
  if (!rlGlobal.success) {
    return new Response(
      sseEvent({ type: 'error', message: 'Demasiadas solicitudes. Intenta en unos segundos.', code: 'AGENT_COOLDOWN' }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
    );
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_WIDGET_BODY_BYTES) {
    return new Response(
      sseEvent({ type: 'error', message: 'Payload demasiado grande.', code: 'PAYLOAD_TOO_LARGE' }),
      { status: 413, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
    );
  }

  // ── Message guard ─────────────────────────────────────────────────────────
  const guardResult = extractAndGuardMessage(rawBody);
  if (!guardResult.ok) {
    return new Response(
      sseEvent({ type: 'error', message: guardResult.message, code: guardResult.code }),
      { status: 400, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
    );
  }

  let parsedAgentId = '';
  let parsedWidgetId = '';
  let parsedSessionId = '';
  let tokenFromBody = '';
  try {
    const j = JSON.parse(rawBody) as { agentId?: string; widgetId?: string; token?: string; sessionId?: string };
    parsedAgentId = typeof j?.agentId === 'string' ? j.agentId.trim() : '';
    parsedWidgetId = typeof j?.widgetId === 'string' ? j.widgetId.trim() : '';
    parsedSessionId = typeof j?.sessionId === 'string' ? j.sessionId.trim() : '';
    tokenFromBody = typeof j?.token === 'string' ? j.token.trim() : '';
  } catch {
    return new Response(
      sseEvent({ type: 'error', message: 'Cuerpo JSON inválido.', code: 'BAD_REQUEST' }),
      { status: 400, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
    );
  }

  const widgetToken = ((req.headers.get('x-widget-token') || '').trim() || tokenFromBody).trim();

  let faqTrackOwnerId: string | null = null;
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
        const quota = await checkConversationQuota(w.userId);
        if (!quota.allowed) {
          return new Response(
            sseEvent({ type: 'error', message: `Límite de ${quota.limit.toLocaleString('es')} conversaciones alcanzado.`, code: 'QUOTA_EXCEEDED' }),
            { status: 200, headers: { 'Content-Type': 'text/event-stream', ...corsHeaders(origin) } },
          );
        }

        try {
          const subForRoute = await Subscription.findOne({ userId: w.userId })
            .select({ plan: 1, status: 1 })
            .lean() as { plan?: string; status?: string } | null;
          const active =
            subForRoute?.status === 'active' || subForRoute?.status === 'trialing';
          const planForRoute = active ? (subForRoute?.plan ?? 'free') : 'free';
          multiAgentCtx = {
            userId: w.userId,
            plan: planForRoute,
            config: buildWidgetMultiAgentConfig(w),
          };
        } catch (routeErr) {
          console.warn('[widget/chat/stream] multi-agent context skipped:', routeErr);
        }
      }
    } catch {
      /* fail-open */
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

      try {
        if (multiAgentCtx) {
          if (multiAgentCtx.config.multiAgentEnabled) {
            enqueue({
              type: 'status',
              phase: 'triage',
              message: buildMultiAgentStatusMessage('triage'),
            });
          }

          if (multiAgentCtx.config.multiAgentEnabled && multiAgentCtx.config.multiAgentMode === 'parallel' && hubSecret) {
            const parallel = await executeParallelMultiAgentFlow({
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
            });
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
              enqueue({ type: 'token', text: parallel.reply });
              enqueue({
                type: 'done',
                reply: parallel.reply,
                agentId: parallel.routedHubAgentId,
                multiAgent: parallel.meta,
              });
              if (widgetToken.startsWith('wt_') && parsedAgentIdLocal) {
                void trackWidgetChatUsage(widgetToken, parsedAgentIdLocal, true).catch(() => {});
              }
              return;
            }
          }

          const routing = await applyMultiAgentRouting({
            rawBody: hubBody,
            config: multiAgentCtx.config,
            userId: multiAgentCtx.userId,
            plan: multiAgentCtx.plan,
          });
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
            const variant = await getActiveVariant(parsedAgentIdLocal, sessionBucket);
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

        if (parsedAgentIdLocal) {
          try {
            await connectDB();
            const agentDoc = await ClientAgent.findById(parsedAgentIdLocal, { strictPurposeOnly: 1, systemPrompt: 1 })
              .lean() as { strictPurposeOnly?: boolean; systemPrompt?: string } | null;
            if (agentDoc?.strictPurposeOnly === true) {
              const parsed = JSON.parse(hubBody) as Record<string, unknown>;
              const basePrompt = typeof parsed.systemPromptOverride === 'string'
                ? parsed.systemPromptOverride
                : (agentDoc.systemPrompt ?? '');
              parsed.systemPromptOverride = basePrompt + STRICT_PURPOSE_SUFFIX;
              hubBody = JSON.stringify(parsed);
            }
          } catch { /* non-critical */ }
        }

        if (hubSecret && widgetToken.startsWith('wt_')) {
          headers['X-Landing-Wt-Valid'] = '1';
          headers[SIGNATURE_HEADER] = signRequest(hubBody, hubSecret);
        }

        let streamMsg = '';
        try {
          const hb = JSON.parse(hubBody) as { message?: string };
          streamMsg = typeof hb?.message === 'string' ? hb.message : '';
        } catch {
          /* ignore */
        }
        const hubUrl = `${base.replace(/\/$/, '')}/api/widget/chat`;
        logWidgetFlow('🌊', 'stream:fetch', 'SSE → AgentFlowhub', {
          traceId,
          hubUrl,
          agentId: parsedAgentIdLocal || undefined,
          ...widgetMessageProbe(streamMsg),
        });
        // Call the regular (non-streaming) hub endpoint
        const res = await fetch(hubUrl, {
          method: 'POST',
          headers,
          body: hubBody,
          signal: AbortSignal.timeout(120_000),
        });

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
          const msg = json.error || json.reply || 'Error del agente.';
          enqueue({ type: 'error', message: msg, code: json.code || 'HUB_ERROR' });
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

        // Send full reply as a single token so the message bubble is created,
        // then immediately send done — no word-by-word delay that risks timeout.
        const mcpTag =
          typeof json.mcpTag === 'string' && json.mcpTag.trim() ? json.mcpTag.trim() : undefined;
        const images = Array.isArray(json.images) && json.images.length ? json.images : undefined;
        const usedModel =
          typeof json.usedModel === 'string' && json.usedModel.trim() ? json.usedModel.trim() : undefined;
        enqueue({ type: 'token', text: fullReply });
        enqueue({
          type: 'done',
          reply: fullReply,
          agentId: json.agentId || parsedAgentIdLocal,
          toolsUsed: json.toolsUsed || [],
          ...(multiAgentMeta ? { multiAgent: multiAgentMeta } : {}),
          ...(mcpTag ? { mcpTag } : {}),
          ...(images ? { images } : {}),
          ...(usedModel ? { usedModel } : {}),
        });

        // Telemetry (non-blocking)
        if (widgetToken.startsWith('wt_') && parsedAgentIdLocal) {
          void trackWidgetChatUsage(widgetToken, parsedAgentIdLocal, true, json.usage).catch(() => {});
          if (faqTrackOwnerId) {
            void trackWidgetUserMessageForFaqCandidates({
              ownerUserId: faqTrackOwnerId,
              agentIdOrHubId: parsedAgentIdLocal,
              rawBody,
            }).catch(() => {});

            // Persist transcript (fire-and-forget — never blocks stream)
            if (streamMsg && fullReply && parsedWidgetId) {
              void (async () => {
                try {
                  const { WidgetMessage } = await import('@/lib/db/models');
                  const baseMsg = {
                    widgetId: parsedWidgetId,
                    userId: faqTrackOwnerId,
                    agentId: parsedAgentIdLocal,
                    sessionId: parsedSessionId || traceId,
                    traceId,
                  };
                  await WidgetMessage.insertMany([
                    { ...baseMsg, role: 'user',      content: streamMsg.slice(0, 4000) },
                    { ...baseMsg, role: 'assistant', content: fullReply.slice(0, 8000) },
                  ]);
                } catch { /* non-critical */ }
              })();
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
        const msg = err instanceof Error ? err.message : 'Error de red.';
        enqueue({ type: 'error', message: msg, code: 'STREAM_ERROR' });
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
