/**
 * Webhooks salientes estándar para que un cliente SaaS enganche su backend.
 * Eventos: conversation.closed | conversation.handoff | quota.reached
 * Firma: HMAC-SHA256 hex en cabecera X-BotIvA-Signature (prefijo sha256=)
 */

import crypto from 'crypto';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription, WebhookOutbox } from '@/lib/db/models';
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
  | 'faq.candidate_detected'
  | 'flow.lead_captured';

export type SaasWebhookPayload<T = unknown> = {
  event: SaasWebhookEventType;
  timestamp: string;
  /** Identificador interno del usuario BotIvA / landing */
  userId: string;
  data: T;
};

let RETRY_DELAYS_MS = [0, 2_000, 8_000];

/**
 * Eventos que, si los reintentos inmediatos fallan por algo reintentable, pasan al outbox
 * (`webhookoutbox`): el worker cron-schendule los reintenta con backoff y quedan en la bitácora.
 * Un lead perdido no se recupera; una notificación de cuota sí puede perderse.
 */
const OUTBOX_EVENTS = new Set<SaasWebhookEventType>(['flow.lead_captured']);

/** Solo tests: sin esperas entre reintentos. */
export function __setSaasRetryDelaysForTests(delays: number[]): void {
  RETRY_DELAYS_MS = delays;
}

type DeliveryOutcome = { ok: boolean; status: number; error?: string; retryable: boolean };

function sign(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret || '').update(body).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function deliver(url: string, secret: string, body: string, deliveryId?: string): Promise<DeliveryOutcome> {
  const sig = sign(body, secret);
  let lastErr: unknown;
  let lastStatus = 0;
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
          ...(deliveryId ? { 'Idempotency-Key': deliveryId } : {}),
        },
        body,
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) return { ok: true, status: res.status, retryable: false };
      lastErr = new Error(`HTTP ${res.status}`);
      lastStatus = res.status;
      // 4xx permanentes (400/401/403/404/410/422…): el destino nunca aceptará el
      // reintento, así que cortamos. 408 (timeout) y 429 (rate limit) SÍ se reintentan.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        console.error('[saas-webhook] delivery failed (permanente)', url, lastErr);
        return { ok: false, status: res.status, error: String(lastErr), retryable: false };
      }
    } catch (err) {
      lastErr = err;
      lastStatus = 0;
    }
  }
  console.error('[saas-webhook] delivery failed', url, lastErr);
  return {
    ok: false,
    status: lastStatus,
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
    retryable: true,
  };
}

async function userMayReceiveOutboundWebhook(userId: string): Promise<boolean> {
  const sub = await Subscription.findOne({ userId }).select({ plan: 1, status: 1, features: 1 }).lean() as
    | { plan?: string; status?: string; features?: string[] }
    | null;
  return canUseOutboundSaasWebhook(sub?.plan ?? 'free', sub?.status ?? 'free', sub?.features);
}

/**
 * Envío best-effort en segundo plano (no bloquea la petición HTTP del usuario).
 */
export function dispatchSaasWebhook<T>(
  userId: string,
  event: SaasWebhookEventType,
  data: T,
): void {
  void sendSaasWebhook(userId, event, data);
}

/**
 * Igual que `dispatchSaasWebhook` pero devuelve la promesa: para envolverla en `after()` en
 * serverless (Vercel puede congelar la función y perder un envío sin esperar). Nunca lanza.
 */
export function sendSaasWebhook<T>(
  userId: string,
  event: SaasWebhookEventType,
  data: T,
): Promise<void> {
  return (async () => {
    try {
      await connectDB();
      if (!(await userMayReceiveOutboundWebhook(userId))) return;

      const u = await User.findById(userId).select({ saasWebhookUrl: 1, saasWebhookSecret: 1 }).lean() as
        | { saasWebhookUrl?: string | null; saasWebhookSecret?: string | null }
        | null;
      if (!u) return;
      const url = typeof u.saasWebhookUrl === 'string' ? u.saasWebhookUrl.trim() : '';
      if (!url || !url.startsWith('https://')) return;

      const useOutbox = OUTBOX_EVENTS.has(event);
      // deliveryId estable: el reintento del worker manda el MISMO y el receptor puede deduplicar.
      const deliveryId = useOutbox ? `dlv_${crypto.randomUUID()}` : undefined;
      const payload: SaasWebhookPayload<T> & { deliveryId?: string } = {
        event,
        timestamp: new Date().toISOString(),
        userId,
        data,
        ...(deliveryId ? { deliveryId } : {}),
      };
      const body = JSON.stringify(payload);
      const secret = typeof u.saasWebhookSecret === 'string' ? u.saasWebhookSecret : '';
      const outcome = await deliver(url, secret, body, deliveryId);
      if (!outcome.ok && outcome.retryable && useOutbox) {
        // El secreto NO se guarda: el worker lo relee de la cuenta al enviar.
        await WebhookOutbox.create({
          tenantId: userId,
          agentId: '',
          webhookName: 'saas',
          event,
          url,
          payload,
          status: 'pending',
          attempts: 0,
          nextRetryAt: new Date(),
          lastStatus: outcome.status,
          lastError: (outcome.error ?? '').slice(0, 500),
        });
      }
    } catch (e) {
      console.error('[saas-webhook] dispatch error', e);
    }
  })();
}
