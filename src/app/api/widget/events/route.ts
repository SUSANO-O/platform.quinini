/**
 * POST /api/widget/events — telemetría del SDK (widget.js).
 * Reenvía a AIBackHub /api/widget-events para que AgentFlowhub Analytics lea los mismos datos.
 *
 * Si añades escritura a disco (p. ej. métricas locales), usa `ensureWritableDataDir()` desde
 * `@/lib/server-writable-data-dir` — en AWS Lambda no se puede crear `./data` bajo `/var/task`.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  canAttemptHubSync,
  getAibackhubBaseUrl,
  hubCreateHeaders,
} from '@/lib/aibackhub-sync';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { connectDB } from '@/lib/db/connection';
import { Widget } from '@/lib/db/models';
import { dispatchSaasWebhook } from '@/lib/saas-webhook-outbound';

const MAX_EVENT_BODY_BYTES = 8 * 1024; // 8 KB — events are tiny

const ALLOWED_EVENTS = new Set([
  'widget_loaded',
  'widget_opened',
  'widget_closed',
  'message_sent',
  'message_received',
  'widget_error',
  /** Derivado del SDK cuando se muestra oferta WhatsApp / humano */
  'conversation_handoff',
]);

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function POST(req: NextRequest) {
  // ── Rate limit: 120 req/min per IP (analytics flood guard) ──────────────────
  const ip = getClientIp(req);
  const rl = checkRateLimit('widget-events', ip, 120, 60_000);
  if (!rl.success) {
    // 200 instead of 429 so the SDK (sendBeacon) doesn't log errors in the console
    return NextResponse.json({ ok: true, dropped: true, reason: 'rate_limited' }, { headers: corsHeaders() });
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text.length > MAX_EVENT_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload demasiado grande.' }, { status: 413, headers: corsHeaders() });
    }
    if (text) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400, headers: corsHeaders() });
  }

  const event = String(body?.event || '').trim();
  const agentId = String(body?.agentId || '').trim();
  if (!event || !agentId || !ALLOWED_EVENTS.has(event)) {
    return NextResponse.json(
      { error: 'Payload inválido para evento de widget.' },
      { status: 400, headers: corsHeaders() },
    );
  }

  // ── Webhooks salientes SaaS (best-effort, no bloquea analytics) ────────────
  try {
    await connectDB();
    const row = await Widget.findOne({ agentId }).select({ userId: 1 }).lean() as
      | { userId?: string }
      | null;
    const uid = row?.userId?.trim();
    if (uid) {
      if (event === 'widget_closed') {
        dispatchSaasWebhook(uid, 'conversation.closed', {
          agentId,
          instanceId: typeof body.instanceId === 'string' ? body.instanceId : undefined,
          timestamp: typeof body.timestamp === 'string' ? body.timestamp : undefined,
        });
      }
      if (event === 'conversation_handoff') {
        dispatchSaasWebhook(uid, 'conversation.handoff', {
          agentId,
          details: typeof body.details === 'object' && body.details !== null ? body.details : {},
        });
      }
    }
  } catch (e) {
    console.warn('[widget/events] saas webhook lookup skipped:', e);
  }

  if (!canAttemptHubSync()) {
    /** Telemetría opcional: 200 para que el SDK no marque error en red/consola. */
    return NextResponse.json(
      { ok: true, forwarded: false, reason: 'backend_url_missing' },
      { status: 200, headers: corsHeaders() },
    );
  }

  const details = body.details;
  const model =
    details && typeof details === 'object' && details !== null && 'model' in details
      ? String((details as { model?: unknown }).model || '').trim() || undefined
      : undefined;

  const base = getAibackhubBaseUrl();
  try {
    const res = await fetch(`${base}/api/widget-events`, {
      method: 'POST',
      headers: hubCreateHeaders(),
      body: JSON.stringify({
        agentId,
        event,
        timestamp: typeof body.timestamp === 'string' ? body.timestamp : undefined,
        instanceId: typeof body.instanceId === 'string' ? body.instanceId : undefined,
        model,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      /** Telemetría best-effort: no devolver 502 al navegador (el SDK usa sendBeacon/fetch y no debe ensuciar la consola). */
      return NextResponse.json(
        {
          ok: true,
          forwarded: false,
          reason: 'hub_rejected',
          status: res.status,
        },
        { status: 200, headers: corsHeaders() },
      );
    }
    return NextResponse.json({ ok: true, forwarded: true }, { headers: corsHeaders() });
  } catch {
    return NextResponse.json(
      { ok: true, forwarded: false, reason: 'hub_unreachable' },
      { status: 200, headers: corsHeaders() },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
