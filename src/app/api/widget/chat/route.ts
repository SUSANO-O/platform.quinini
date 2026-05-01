/**
 * POST /api/widget/chat — proxy al mismo endpoint de AgentFlowhub.
 * El SDK usa host = origen de la landing; el chat sigue las reglas del hub (agentes, RAG, tokens).
 * Los tokens wt_* se validan aquí contra Mongo y se reenvían cabeceras firmadas al hub.
 */

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAgentflowhubBaseUrl } from '@/lib/aibackhub-sync';
import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription } from '@/lib/db/models';
import { findWidgetForWtToken, sentAgentIdMatchesWidget } from '@/lib/widget-token-verify';
import { trackWidgetChatUsage } from '@/lib/platform-agent-utils';
import { checkConversationQuota } from '@/lib/quota';
import { dispatchSaasWebhook } from '@/lib/saas-webhook-outbound';
import { getAgentLimits } from '@/lib/agent-plans';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { trackWidgetUserMessageForFaqCandidates } from '@/lib/widget-faq-tracker';

/** Max body size accepted from widget SDK (64 KB) */
const MAX_WIDGET_BODY_BYTES = 64 * 1024;

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
    const payload = JSON.parse(rawBody) as { messages?: Array<{ role?: string }> };
    if (!Array.isArray(payload.messages)) return 0;
    return payload.messages.reduce((acc, msg) => {
      const role = String(msg?.role || '').toLowerCase();
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
  // Bloquea floods masivos sin penalizar NAT compartido (oficinas, universidades).
  // 120/min = 2 req/seg: imposible para un humano, trivial para un bot.
  const ip = getClientIp(req);
  const rlGlobal = checkRateLimit('widget-chat-ip', ip, 120, 60_000);
  if (!rlGlobal.success) {
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
  const rawBody = await req.text();

  // Enforce size after read (content-length puede ser falso o ausente)
  if (rawBody.length > MAX_WIDGET_BODY_BYTES) {
    return NextResponse.json(
      { error: 'Payload demasiado grande.', code: 'PAYLOAD_TOO_LARGE' },
      { status: 413, headers: cors(origin) },
    );
  }

  // ── Rate limit paso 2: IP + agentId — 48/min por widget (alineado con AgentFlowhub por defecto) ─
  // Clave compuesta: usuarios de la misma NAT no comparten cupo entre widgets distintos.
  try {
    const parsedForRl = JSON.parse(rawBody) as { agentId?: unknown };
    const agentIdForRl = typeof parsedForRl?.agentId === 'string' ? parsedForRl.agentId.trim().slice(0, 100) : '';
    if (agentIdForRl) {
      const rlAgent = checkRateLimit('widget-chat-agent', `${ip}:${agentIdForRl}`, 48, 60_000);
      if (!rlAgent.success) {
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
  const userTurnCount = estimateUserTurnFromBody(rawBody);
  try {
    const j = JSON.parse(rawBody) as { agentId?: string; widgetId?: string; token?: string };
    parsedAgentId = typeof j?.agentId === 'string' ? j.agentId.trim() : '';
    parsedWidgetId = typeof j?.widgetId === 'string' ? j.widgetId.trim() : '';
    tokenFromBody = typeof j?.token === 'string' ? j.token.trim() : '';
  } catch {
    /* body no JSON */
  }

  const widgetToken = (
    (req.headers.get('x-widget-token') || '').trim() ||
    tokenFromBody
  ).trim();

  const traceId = requestIdEarly;

  /** Dueño del widget (token wt_*): para telemetría de candidatas a FAQ tras respuesta OK. */
  let faqTrackOwnerId: string | null = null;

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
        // ── Quota check ──────────────────────────────────────────────────
        try {
          const quota = await checkConversationQuota(w.userId);
          if (!quota.allowed) {
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
        headers['X-Landing-Wt-Valid'] = '1';
        headers['X-Hub-Sync-Secret'] = secret;

        /** Webhook builtin: AgentFlowhub a veces no usa MCP → solo JSON en texto. Ir directo a AIBackHub ejecuta el POST real. */
        try {
          const direct = await tryServeWidgetChatViaHubMcp({
            widgetTokenStartsWithWt: true,
            parsedAgentId,
            rawBody,
            ownerUserId: w.userId,
          });
          if (direct) {
            trackWidgetChatUsage(widgetToken, parsedAgentId, true).catch(() => {});
            void trackWidgetUserMessageForFaqCandidates({
              ownerUserId: w.userId,
              agentIdOrHubId: parsedAgentId,
              rawBody,
            }).catch(() => {});
            return NextResponse.json(
              {
                reply: direct.reply,
                toolsUsed: direct.toolsUsed,
                agentId: parsedAgentId,
              },
              { status: 200, headers: cors(origin) },
            );
          }
        } catch (directErr) {
          console.error('[widget/chat] direct MCP path error:', directErr);
        }
      }
    } catch {
      /* sin DB: el hub intentará validación remota si está configurada */
    }
  }

  const init: RequestInit = {
    method: 'POST',
    headers,
    body: rawBody,
    signal: AbortSignal.timeout(120_000),
  };

  try {
    const res = await fetchHubWidgetChat(base, init);

    const data = await res.text();
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
      trackWidgetChatUsage(widgetToken, parsedAgentId, true).catch(() => {});
      if (faqTrackOwnerId) {
        void trackWidgetUserMessageForFaqCandidates({
          ownerUserId: faqTrackOwnerId,
          agentIdOrHubId: parsedAgentId,
          rawBody,
        }).catch(() => {});
      }
    }

    return new NextResponse(data, { status: res.status, headers: out });
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

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, X-Widget-Token, X-Request-Id, X-Trace-Id',
  };
}
