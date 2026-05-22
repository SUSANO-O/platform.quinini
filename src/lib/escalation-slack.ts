/**
 * Notificación nativa a Slack (Incoming Webhook) al escalar una conversación.
 * Plan mínimo: Starter (mismo que webhook saliente).
 */

import { Subscription, User } from '@/lib/db/models';
import { planRank, OUTBOUND_SAAS_WEBHOOK_MIN_PLAN, type PlanId } from '@/lib/plan-catalog';
import {
  buildEscalationTranscript,
  type EscalationTicketContext,
} from '@/lib/escalation-tickets';

export type EscalationSlackResult = {
  attempted: boolean;
  ok?: boolean;
  error?: string;
  skippedReason?: string;
};

export function isValidSlackIncomingWebhookUrl(raw: string): boolean {
  const url = raw.trim();
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'hooks.slack.com' && u.pathname.length > 1;
  } catch {
    return false;
  }
}

export function normalizeSlackIncomingWebhookUrl(raw: string): string {
  return raw.trim();
}

async function resolveUserPlan(userId: string): Promise<PlanId> {
  const sub = await Subscription.findOne({ userId }).select({ plan: 1, status: 1 }).lean() as
    | { plan?: string; status?: string }
    | null;
  const active = sub?.status === 'active' || sub?.status === 'trialing';
  return (active ? (sub?.plan ?? 'free') : 'free') as PlanId;
}

function planHasEscalationSlackFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(OUTBOUND_SAAS_WEBHOOK_MIN_PLAN);
}

export async function loadEscalationSlackWebhookUrl(userId: string): Promise<string | null> {
  const u = await User.findById(userId).select({ escalationSlackWebhookUrl: 1 }).lean() as
    | { escalationSlackWebhookUrl?: string | null }
    | null;
  const url = typeof u?.escalationSlackWebhookUrl === 'string' ? u.escalationSlackWebhookUrl.trim() : '';
  return url && isValidSlackIncomingWebhookUrl(url) ? url : null;
}

function escapeSlackText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSlackPayload(ctx: EscalationTicketContext, transcript: string, inboxUrl?: string) {
  const name = ctx.contactInfo?.name?.trim() || 'Sin nombre';
  const email = ctx.contactInfo?.email?.trim() || '—';
  const phone = ctx.contactInfo?.phone?.trim() || '—';
  const message = ctx.userMessage?.trim() || '—';
  const widget = ctx.widgetName || ctx.widgetId;
  const session = ctx.sessionId || '—';

  const lines = [
    `*Widget:* ${escapeSlackText(widget)}`,
    `*Sesión:* \`${session}\``,
    `*Contacto:* ${escapeSlackText(name)}`,
    `*Email:* ${escapeSlackText(email)}`,
    `*Teléfono:* ${escapeSlackText(phone)}`,
    `*Mensaje:* ${escapeSlackText(message)}`,
  ];

  if (transcript) {
    const excerpt = transcript.length > 2800 ? `${transcript.slice(0, 2800)}…` : transcript;
    lines.push('', '*Transcript:*', '```', excerpt, '```');
  }

  if (inboxUrl) {
    lines.push('', `<${inboxUrl}|Abrir Inbox en BotIvA>`);
  }

  const text = `Escalación BotIvA — ${widget} — ${name}`;

  return {
    text,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🙋 Solicitud de atención humana', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: lines.join('\n') },
      },
    ],
  };
}

export async function postSlackEscalationWebhook(
  webhookUrl: string,
  ctx: EscalationTicketContext,
  options?: { inboxUrl?: string; test?: boolean },
): Promise<EscalationSlackResult> {
  if (!isValidSlackIncomingWebhookUrl(webhookUrl)) {
    return { attempted: true, ok: false, error: 'URL de Slack inválida.' };
  }

  const transcript = options?.test
    ? 'Usuario: Hola, necesito ayuda con mi pedido.\n\nAsistente: Claro, ¿tienes el número de orden?'
    : await buildEscalationTranscript(ctx);

  const testCtx: EscalationTicketContext = options?.test
    ? {
        userId: ctx.userId,
        widgetId: ctx.widgetId || 'test-widget',
        widgetName: ctx.widgetName || 'Widget de prueba',
        sessionId: ctx.sessionId || 'test-session',
        userMessage: 'Mensaje de prueba desde BotIvA',
        contactInfo: { name: 'Usuario de prueba', email: 'prueba@ejemplo.com', phone: '+34 600 000 000' },
      }
    : ctx;

  const body = buildSlackPayload(testCtx, transcript, options?.inboxUrl);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    const raw = await res.text();
    if (!res.ok) {
      return { attempted: true, ok: false, error: `Slack HTTP ${res.status}: ${raw.slice(0, 200)}` };
    }
    if (raw.trim() === 'invalid_token' || raw.trim() === 'channel_not_found') {
      return { attempted: true, ok: false, error: `Slack: ${raw.trim()}` };
    }
    return { attempted: true, ok: true };
  } catch (err) {
    return {
      attempted: true,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Best-effort al escalar; no lanza excepciones. */
export async function notifySlackOnEscalation(
  ctx: EscalationTicketContext,
  inboxUrl?: string,
): Promise<EscalationSlackResult> {
  const plan = await resolveUserPlan(ctx.userId);
  if (!planHasEscalationSlackFeature(plan)) {
    return { attempted: false, skippedReason: 'plan_insufficient' };
  }

  const webhookUrl = await loadEscalationSlackWebhookUrl(ctx.userId);
  if (!webhookUrl) {
    return { attempted: false, skippedReason: 'not_configured' };
  }

  return postSlackEscalationWebhook(webhookUrl, ctx, { inboxUrl });
}
