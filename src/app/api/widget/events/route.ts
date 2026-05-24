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
import { inboxSessionFilter, upsertHandoffInboxSession } from '@/lib/inbox-handoff';
import { dispatchSaasWebhook } from '@/lib/saas-webhook-outbound';
import {
  normalizeHandoffNotifyMode,
  shouldDispatchHandoffWebhook,
} from '@/lib/handoff-notify';
import { scheduleWidgetUsageDiskLog } from '@/lib/widget-usage-disk';
import { randomUUID } from 'crypto';

const MAX_EVENT_BODY_BYTES = 8 * 1024; // 8 KB — events are tiny

const CLIENT_SESSION_ID_RE = /^sess_[a-zA-Z0-9_-]{8,120}$/;

function normalizeClientSessionId(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s || !CLIENT_SESSION_ID_RE.test(s)) return '';
  return s;
}

async function findWidgetSession(
  userId: string,
  agentId: string,
  sessionId: string,
) {
  if (sessionId) {
    return ConversationSession.findOne({ sessionId, userId }).lean();
  }
  return ConversationSession.findOne(
    { agentId, userId, endedAt: null },
    null,
    { sort: { startedAt: -1 } },
  ).lean();
}

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
  'multi_agent_routed',
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

  scheduleWidgetUsageDiskLog({
    event,
    agentId,
    instanceId: typeof body.instanceId === 'string' ? body.instanceId : undefined,
  });

  // ── Session analytics + Webhooks SaaS (best-effort) ──────────────────────
  try {
    await connectDB();

    // Validar token si viene en el payload (eventos autenticados)
    // Si no viene token, se acepta pero sin acceso a datos sensibles (retrocompatibilidad)
    type WidgetRow = {
      userId?: string;
      _id?: unknown;
      allowedOrigins?: string[];
      active?: boolean;
      agentId?: unknown;
      handoffNotifyMode?: string;
      handoffEnabled?: boolean;
      humanSupportEnabled?: boolean;
    };
    let row: WidgetRow | null = null;
    if (widgetToken.startsWith('wt_')) {
      row = await Widget.findOne({ afhubToken: widgetToken })
        .select({ userId: 1, _id: 1, allowedOrigins: 1, active: 1, agentId: 1, handoffNotifyMode: 1, handoffEnabled: 1, humanSupportEnabled: 1 })
        .lean() as WidgetRow | null;
      if (row && (row as { active?: boolean }).active === false) {
        return NextResponse.json(
          { ok: true, dropped: true, reason: 'widget_disabled' },
          { headers: corsHeaders() },
        );
      }
      // Verificar que el agentId del evento corresponde al widget del token
      if (row) {
        const widgetAgentId = row.agentId ? String(row.agentId).trim() : '';
        if (widgetAgentId && widgetAgentId !== agentId) {
          return NextResponse.json({ ok: true, dropped: true, reason: 'token_mismatch' }, { headers: corsHeaders() });
        }
      }
    } else {
      // Sin token: buscar por agentId (modo legacy/retrocompatible)
      row = await Widget.findOne({ agentId }).select({ userId: 1, _id: 1 }).lean() as WidgetRow | null;
    }

    const uid = row?.userId?.trim();
    const widgetId = row?._id ? String(row._id) : '';

    if (uid && widgetId) {
      const instanceId = typeof body.instanceId === 'string' ? body.instanceId.trim() : '';
      const clientSessionId = normalizeClientSessionId(body.sessionId);
      const now = new Date();
      const month = now.toISOString().slice(0, 7);
      const sessionKey = instanceId || `${widgetId}-${Date.now()}`;

      if (event === 'widget_opened') {
        const sid = clientSessionId || `sess_${sessionKey}_${randomUUID().slice(0, 8)}`;
        await ConversationSession.findOneAndUpdate(
          { sessionId: sid },
          {
            $setOnInsert: {
              widgetId,
              userId: uid,
              agentId,
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
            $set: { widgetId, agentId },
          },
          { upsert: true },
        );
      }

      if (event === 'message_received') {
        const details = body.details as Record<string, unknown> | null;
        const msgLen = typeof details?.length === 'number' ? details.length : 0;
        const sentimentPositive = msgLen > 20;
        const sessionFilter = clientSessionId
          ? { sessionId: clientSessionId, userId: uid }
          : { agentId, userId: uid, endedAt: null };
        await ConversationSession.findOneAndUpdate(
          sessionFilter,
          {
            $inc: { messageCount: 1 },
            $set: { sentiment: sentimentPositive ? 'positive' : 'neutral' },
          },
          clientSessionId ? {} : { sort: { startedAt: -1 } },
        );
      }

      if (event === 'widget_closed') {
        const session = await findWidgetSession(uid, agentId, clientSessionId);
        if (session) {
          const startedAt = session.startedAt instanceof Date
            ? session.startedAt
            : new Date(String(session.startedAt));
          const durationSec = Math.round((now.getTime() - startedAt.getTime()) / 1000);
          const dropped = (session.messageCount ?? 0) < 1;
          await ConversationSession.updateOne(
            { _id: session._id },
            { $set: { endedAt: now, durationSec, dropped } },
          );
        }
        dispatchSaasWebhook(uid, 'conversation.closed', {
          agentId,
          sessionId: clientSessionId || undefined,
          instanceId: instanceId || undefined,
          timestamp: typeof body.timestamp === 'string' ? body.timestamp : undefined,
        });
      }

      if (event === 'conversation_handoff') {
        const details = body.details as Record<string, unknown> | null;
        const reason = typeof details?.reason === 'string' ? details.reason.trim() : '';
        const channel = typeof details?.channel === 'string' ? details.channel.trim() : '';
        const handoffNotifyMode = normalizeHandoffNotifyMode(row?.handoffNotifyMode);
        const handoffEnabled = row?.handoffEnabled !== false;
        const humanSupportEnabled = row?.humanSupportEnabled !== false;

        // Oferta WhatsApp por palabra clave: no es una solicitud de inbox.
        if (reason === 'keyword_whatsapp_offer') {
          if (humanSupportEnabled && shouldDispatchHandoffWebhook(handoffNotifyMode)) {
            dispatchSaasWebhook(uid, 'conversation.handoff', {
              agentId,
              sessionId: clientSessionId || undefined,
              details: details ?? {},
            });
          }
        } else if (reason === 'form_submit') {
          // POST /api/widgets/[id]/handoff ya persiste inbox + webhook/Slack según handoffNotifyMode.
        } else {
          const contactRaw = details?.contactInfo as Record<string, unknown> | null;
          const contactInfo = {
            name: typeof contactRaw?.name === 'string' ? contactRaw.name.trim() : '',
            email: typeof contactRaw?.email === 'string' ? contactRaw.email.trim() : '',
            phone: typeof contactRaw?.phone === 'string' ? contactRaw.phone.trim() : '',
          };
          const hasContact = !!(contactInfo.name || contactInfo.email || contactInfo.phone);
          const isInboxHandoff =
            reason === 'form_submit' || channel === 'inbox' || hasContact;

          // form_submit ya persiste vía POST /api/widgets/[id]/handoff — evitar duplicado en inbox
          if (isInboxHandoff && clientSessionId && reason !== 'form_submit') {
            await upsertHandoffInboxSession({
              sessionId: clientSessionId,
              userId: uid,
              widgetId,
              agentId,
              contactInfo,
              handoffAt: now,
            });
          } else if (isInboxHandoff && !clientSessionId) {
            const sessionFilter = { agentId, userId: uid, endedAt: null };
            await ConversationSession.findOneAndUpdate(
              sessionFilter,
              {
                $set: {
                  escalated: true,
                  inboxStatus: 'open',
                  handoffAt: now,
                  widgetId,
                  agentId,
                  ...(hasContact ? { handoffContact: contactInfo } : {}),
                },
              },
              { sort: { startedAt: -1 } },
            );
          }

          if (handoffEnabled && shouldDispatchHandoffWebhook(handoffNotifyMode)) {
            dispatchSaasWebhook(uid, 'conversation.handoff', {
              agentId,
              sessionId: clientSessionId || undefined,
              details: details ?? {},
            });
          }
        }
      }

      if (event === 'multi_agent_routed') {
        const details = body.details as Record<string, unknown> | null;
        const handoff = details?.handoff === true;
        const mode = typeof details?.mode === 'string' ? details.mode : 'triage';
        const inc: Record<string, number> = { multiAgentRouted: 1 };
        if (handoff) inc.multiAgentHandoffs = 1;
        if (mode === 'parallel') inc.multiAgentParallel = 1;
        const sessionFilter = clientSessionId
          ? { sessionId: clientSessionId, userId: uid }
          : { agentId, userId: uid, endedAt: null };
        await ConversationSession.findOneAndUpdate(
          sessionFilter,
          { $inc: inc },
          clientSessionId ? {} : { sort: { startedAt: -1 } },
        );
        dispatchSaasWebhook(uid, 'conversation.multi_agent_routed', {
          agentId,
          widgetId,
          sessionId: clientSessionId || undefined,
          mode,
          handoff,
          specialist: typeof details?.specialist === 'string' ? details.specialist : null,
          synthesized: details?.synthesized === true,
          triageMethod: typeof details?.triageMethod === 'string' ? details.triageMethod : null,
        });
      }

      if (event === 'message_feedback') {
        const details = body.details as Record<string, unknown> | null;
        const positive = details?.rating === 'positive' || details?.helpful === true;
        const sessionFilter = clientSessionId
          ? { sessionId: clientSessionId, userId: uid }
          : { agentId, userId: uid, endedAt: null };
        await ConversationSession.findOneAndUpdate(
          sessionFilter,
          { $set: { resolved: positive, sentiment: positive ? 'positive' : 'negative' } },
          clientSessionId ? {} : { sort: { startedAt: -1 } },
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
        sessionId: normalizeClientSessionId(body.sessionId) || undefined,
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
