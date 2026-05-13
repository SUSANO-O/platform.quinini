/**
 * POST /api/widget/chat/stream
 *
 * Mismo flujo que /api/widget/chat pero devuelve la respuesta como SSE (text/event-stream)
 * para que el widget muestre los tokens apareciendo en tiempo real (efecto ChatGPT).
 *
 * Protocolo SSE:
 *   data: {"type":"token","text":"Hola"}\n\n
 *   data: {"type":"token","text":" ¿cómo"}\n\n
 *   data: {"type":"done","reply":"<texto completo>","agentId":"..."}\n\n
 *   data: {"type":"error","message":"..."}\n\n
 */

import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { getAgentflowhubBaseUrl } from '@/lib/aibackhub-sync';
import { connectDB } from '@/lib/db/connection';
import { findWidgetForWtToken, sentAgentIdMatchesWidget } from '@/lib/widget-token-verify';
import { checkConversationQuota } from '@/lib/quota';
import { trackWidgetChatUsage } from '@/lib/platform-agent-utils';
import { trackWidgetUserMessageForFaqCandidates } from '@/lib/widget-faq-tracker';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';
import { getActiveVariant } from '@/lib/ab-testing';
import { isOriginAllowed } from '@/lib/widget-origin-check';
import { extractAndGuardMessage } from '@/lib/message-guard';
import { signRequest, SIGNATURE_HEADER } from '@/lib/hub-signature';

export const maxDuration = 60; // Vercel: allow up to 60s for LLM + streaming

const MAX_WIDGET_BODY_BYTES = 64 * 1024;

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
      }
    } catch {
      /* fail-open */
    }
  }

  const base = getAgentflowhubBaseUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Trace-Id': traceId,
    'X-Request-Id': traceId,
  };
  if (widgetToken) headers['X-Widget-Token'] = widgetToken;

  // A/B variant selection — override systemPrompt if a running test exists
  let activeVariantId: string | null = null;
  let hubBody = rawBody;
  if (parsedAgentId) {
    try {
      const sessionBucket = parsedSessionId || traceId;
      const variant = await getActiveVariant(parsedAgentId, sessionBucket);
      if (variant) {
        activeVariantId = variant.id;
        const parsed = JSON.parse(rawBody) as Record<string, unknown>;
        parsed.systemPromptOverride = variant.systemPrompt;
        parsed._abVariantId = variant.id;
        hubBody = JSON.stringify(parsed);
      }
    } catch {
      /* non-critical */
    }
  }

  // Sign hubBody (the actual body sent to AgentFlowhub, possibly modified by A/B)
  const secret = process.env.HUB_TO_LANDING_SECRET?.trim();
  if (secret && widgetToken.startsWith('wt_')) {
    headers['X-Landing-Wt-Valid'] = '1';
    headers[SIGNATURE_HEADER] = signRequest(hubBody, secret);
  }

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(data)));
      };

      try {
        // Call the regular (non-streaming) hub endpoint
        const hubUrl = `${base.replace(/\/$/, '')}/api/widget/chat`;
        const res = await fetch(hubUrl, {
          method: 'POST',
          headers,
          body: hubBody,
          signal: AbortSignal.timeout(120_000),
        });

        const json = await res.json() as { reply?: string; response?: string; text?: string; agentId?: string; toolsUsed?: string[]; code?: string; error?: string };

        if (!res.ok || json.code === 'AGENT_COOLDOWN' || json.error) {
          const msg = json.error || json.reply || 'Error del agente.';
          enqueue({ type: 'error', message: msg, code: json.code || 'HUB_ERROR' });
          controller.close();
          return;
        }

        const fullReply = json.reply || json.response || json.text || '';

        // Send full reply as a single token so the message bubble is created,
        // then immediately send done — no word-by-word delay that risks timeout.
        enqueue({ type: 'token', text: fullReply });
        enqueue({
          type: 'done',
          reply: fullReply,
          agentId: json.agentId || parsedAgentId,
          toolsUsed: json.toolsUsed || [],
        });

        // Telemetry (non-blocking)
        if (widgetToken.startsWith('wt_') && parsedAgentId) {
          void trackWidgetChatUsage(widgetToken, parsedAgentId, true).catch(() => {});
          if (faqTrackOwnerId) {
            void trackWidgetUserMessageForFaqCandidates({
              ownerUserId: faqTrackOwnerId,
              agentIdOrHubId: parsedAgentId,
              rawBody,
            }).catch(() => {});
          }
        }

        // A/B metrics: record session for the variant (single message = 1 session unit)
        if (activeVariantId && parsedAgentId) {
          void fetch(
            `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/agents/${parsedAgentId}/ab-tests/metrics`,
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
