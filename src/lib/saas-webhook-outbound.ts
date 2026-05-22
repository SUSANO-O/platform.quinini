/**
 * Webhooks salientes estándar para que un cliente SaaS enganche su backend.
 * Eventos: conversation.closed | conversation.handoff | quota.reached
 * Firma: HMAC-SHA256 hex en cabecera X-BotIvA-Signature (prefijo sha256=)
 */

import crypto from 'crypto';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription } from '@/lib/db/models';
import { canUseOutboundSaasWebhook } from '@/lib/plan-catalog';

export type SaasWebhookEventType =
  | 'conversation.started'
  | 'conversation.closed'
  | 'conversation.handoff'
  | 'conversation.escalation'
  | 'conversation.message_sent'
  | 'conversation.message_received'
  | 'conversation.feedback'
  | 'conversation.multi_agent_routed'
  | 'quota.reached'
  | 'quota.warning'
  | 'agent.created'
  | 'agent.updated'
  | 'faq.candidate_detected';

export type SaasWebhookPayload<T = unknown> = {
  event: SaasWebhookEventType;
  timestamp: string;
  /** Identificador interno del usuario BotIvA / landing */
  userId: string;
  data: T;
};

const RETRY_DELAYS_MS = [0, 2_000, 8_000];

function sign(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret || '').update(body).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function deliver(url: string, secret: string, body: string): Promise<void> {
  const sig = sign(body, secret);
  let lastErr: unknown;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BotIvA-Signature': sig,
          'X-BotIvA-Event': (JSON.parse(body) as SaasWebhookPayload).event,
          'User-Agent': 'BotIvA-Landing-Webhooks/1.0',
        },
        body,
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) return;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  console.error('[saas-webhook] delivery failed', url, lastErr);
}

async function userMayReceiveOutboundWebhook(userId: string): Promise<boolean> {
  const sub = await Subscription.findOne({ userId }).select({ plan: 1, status: 1 }).lean() as
    | { plan?: string; status?: string }
    | null;
  return canUseOutboundSaasWebhook(sub?.plan ?? 'free', sub?.status ?? 'free');
}

/**
 * Envío best-effort en segundo plano (no bloquea la petición HTTP del usuario).
 */
export function dispatchSaasWebhook<T>(
  userId: string,
  event: SaasWebhookEventType,
  data: T,
): void {
  void (async () => {
    try {
      await connectDB();
      if (!(await userMayReceiveOutboundWebhook(userId))) return;

      const u = await User.findById(userId).select({ saasWebhookUrl: 1, saasWebhookSecret: 1 }).lean() as
        | { saasWebhookUrl?: string | null; saasWebhookSecret?: string | null }
        | null;
      if (!u) return;
      const url = typeof u.saasWebhookUrl === 'string' ? u.saasWebhookUrl.trim() : '';
      if (!url || !url.startsWith('https://')) return;

      const payload: SaasWebhookPayload<T> = {
        event,
        timestamp: new Date().toISOString(),
        userId,
        data,
      };
      const body = JSON.stringify(payload);
      const secret = typeof u.saasWebhookSecret === 'string' ? u.saasWebhookSecret : '';
      await deliver(url, secret, body);
    } catch (e) {
      console.error('[saas-webhook] dispatch error', e);
    }
  })();
}
