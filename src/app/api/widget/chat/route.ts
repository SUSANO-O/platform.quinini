/**
 * POST /api/widget/chat — proxy al mismo endpoint de AgentFlowhub.
 * El SDK usa host = origen de la landing; el chat sigue las reglas del hub (agentes, RAG, tokens).
 * Los tokens wt_* se validan aquí contra Mongo y se reenvían cabeceras firmadas al hub.
 */

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAgentflowhubBaseUrl } from '@/lib/aibackhub-sync';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription } from '@/lib/db/models';
import { findWidgetForWtToken, sentAgentIdMatchesWidget } from '@/lib/widget-token-verify';
import { trackWidgetChatUsage } from '@/lib/platform-agent-utils';
import { checkConversationQuota } from '@/lib/quota';
import { getAgentLimits } from '@/lib/agent-plans';

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

export async function POST(req: NextRequest) {
  const base = getAgentflowhubBaseUrl();
  const body = await req.text();
  const origin = req.headers.get('origin') || '*';
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
  try {
    const j = JSON.parse(body) as { agentId?: string; widgetId?: string; token?: string };
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

  const traceId =
    (req.headers.get('x-trace-id') || req.headers.get('x-request-id') || '').trim() ||
    randomUUID();

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
        // ── Quota check ──────────────────────────────────────────────────
        try {
          const quota = await checkConversationQuota(w.userId);
          if (!quota.allowed) {
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
        } catch {
          /* Si falla la comprobación de cuota, dejamos pasar (fail-open) */
        }

        // ── Sub-agent limit check ─────────────────────────────────────────
        try {
          const sub = await Subscription.findOne({ userId: w.userId })
            .select({ plan: 1, status: 1 })
            .lean() as { plan?: string; status?: string } | null;
          const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
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
      }
    } catch {
      /* sin DB: el hub intentará validación remota si está configurada */
    }
  }

  const init: RequestInit = {
    method: 'POST',
    headers,
    body,
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
        error: 'No se pudo conectar con AgentFlowhub.',
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
