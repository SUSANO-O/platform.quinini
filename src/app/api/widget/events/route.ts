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
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';
import { connectDB } from '@/lib/db/connection';
import { Widget, ConversationSession } from '@/lib/db/models';
import { dispatchSaasWebhook } from '@/lib/saas-webhook-outbound';
import { randomUUID } from 'crypto';

const MAX_EVENT_BODY_BYTES = 8 * 1024; // 8 KB — events are tiny

const ALLOWED_EVENTS = new Set([
  'widget_loaded',
  'widget_opened',
  'widget_closed',
  'message_sent',
  'message_received',
  'message_feedback',
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
  const rl = await checkRateLimitAsync('widget-events', ip, 120, 60_000);
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
  const widgetToken = String(body?.token || '').trim();

  if (!event || !agentId || !ALLOWED_EVENTS.has(event)) {
    return NextResponse.json(
      { error: 'Payload inválido para evento de widget.' },
      { status: 400, headers: corsHeaders() },
    );
  }

  // ── Session analytics + Webhooks SaaS (best-effort) ──────────────────────
  try {
    await connectDB();

    // Validar token si viene en el payload (eventos autenticados)
    // Si no viene token, se acepta pero sin acceso a datos sensibles (retrocompatibilidad)
    let row: { userId?: string; _id?: unknown; allowedOrigins?: string[] } | null = null;
    if (widgetToken.startsWith('wt_')) {
      row = await Widget.findOne({ afhubToken: widgetToken })
        .select({ userId: 1, _id: 1, allowedOrigins: 1 })
        .lean() as typeof row;
      // Verificar que el agentId del evento corresponde al widget del token
      if (row) {
        const widgetData = await Widget.findById(row._id).select({ agentId: 1 }).lean() as
          | { agentId?: unknown } | null;
        const widgetAgentId = widgetData?.agentId ? String(widgetData.agentId).trim() : '';
        if (widgetAgentId && widgetAgentId !== agentId) {
          return NextResponse.json({ ok: true, dropped: true, reason: 'token_mismatch' }, { headers: corsHeaders() });
        }
      }
    } else {
      // Sin token: buscar por agentId (modo legacy/retrocompatible)
      row = await Widget.findOne({ agentId }).select({ userId: 1, _id: 1 }).lean() as typeof row;
    }

    const uid = row?.userId?.trim();
    const widgetId = row?._id ? String(row._id) : '';

    if (uid && widgetId) {
      const instanceId = typeof body.instanceId === 'string' ? body.instanceId.trim() : '';
      const now = new Date();
      const month = now.toISOString().slice(0, 7);
      const sessionKey = instanceId || `${widgetId}-${Date.now()}`;

      if (event === 'widget_opened') {
        // Start new session
        const sid = `sess_${sessionKey}_${randomUUID().slice(0, 8)}`;
        await ConversationSession.findOneAndUpdate(
          { sessionId: sid },
          {
            $setOnInsert: {
              widgetId, userId: uid, agentId,
              sessionId: sid,
              startedAt: now,
              hourOfDay: now.getHours(),
              dayOfWeek: now.getDay(),
              month,
              messageCount: 0,
              dropped: false,
              escalated: false,
              sentiment: 'neutral',
            },
          },
          { upsert: true },
        );
      }

      if (event === 'message_received') {
        // Increment message count & detect sentiment from details
        const details = body.details as Record<string, unknown> | null;
        const msgLen = typeof details?.length === 'number' ? details.length : 0;
        const sentimentPositive = msgLen > 20; // simple heuristic — replace with real NLP later
        await ConversationSession.findOneAndUpdate(
          { agentId, userId: uid, endedAt: null },
          {
            $inc: { messageCount: 1 },
            $set: { sentiment: sentimentPositive ? 'positive' : 'neutral' },
          },
          { sort: { startedAt: -1 } },
        );
      }

      if (event === 'widget_closed') {
        // End session, calculate duration
        const session = await ConversationSession.findOne(
          { agentId, userId: uid, endedAt: null },
          null,
          { sort: { startedAt: -1 } },
        );
        if (session) {
          const durationSec = Math.round((now.getTime() - session.startedAt.getTime()) / 1000);
          const dropped = (session.messageCount ?? 0) < 1;
          await ConversationSession.updateOne(
            { _id: session._id },
            { $set: { endedAt: now, durationSec, dropped } },
          );
        }
        dispatchSaasWebhook(uid, 'conversation.closed', {
          agentId,
          instanceId: instanceId || undefined,
          timestamp: typeof body.timestamp === 'string' ? body.timestamp : undefined,
        });
      }

      if (event === 'conversation_handoff') {
        await ConversationSession.findOneAndUpdate(
          { agentId, userId: uid, endedAt: null },
          { $set: { escalated: true } },
          { sort: { startedAt: -1 } },
        );
        dispatchSaasWebhook(uid, 'conversation.handoff', {
          agentId,
          details: typeof body.details === 'object' && body.details !== null ? body.details : {},
        });
      }

      if (event === 'message_feedback') {
        const details = body.details as Record<string, unknown> | null;
        const positive = details?.rating === 'positive' || details?.helpful === true;
        await ConversationSession.findOneAndUpdate(
          { agentId, userId: uid, endedAt: null },
          { $set: { resolved: positive, sentiment: positive ? 'positive' : 'negative' } },
          { sort: { startedAt: -1 } },
        );
      }
    }
  } catch (e) {
    console.warn('[widget/events] analytics/webhook skipped:', e);
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
