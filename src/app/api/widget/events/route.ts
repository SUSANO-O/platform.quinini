/**
 * POST /api/widget/events — telemetría del SDK (widget.js).
 * Reenvía a AIBackHub /api/widget-events para que AgentFlowhub Analytics lea los mismos datos.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  canAttemptHubSync,
  getAibackhubBaseUrl,
  hubCreateHeaders,
} from '@/lib/aibackhub-sync';

const ALLOWED_EVENTS = new Set([
  'widget_loaded',
  'widget_opened',
  'widget_closed',
  'message_sent',
  'message_received',
  'widget_error',
]);

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
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
