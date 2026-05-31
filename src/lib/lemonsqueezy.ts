/**
 * LemonSqueezy — cliente servidor + catálogo de planes (IDs de variante).
 * Los precios y límites vienen de plan-catalog.ts (fuente única de verdad).
 *
 * Variables de entorno requeridas:
 *   LEMONSQUEEZY_API_KEY
 *   LEMONSQUEEZY_STORE_ID
 *   LEMONSQUEEZY_WEBHOOK_SECRET
 *   LEMONSQUEEZY_VARIANT_SOLO | TEAM | PLUS | BUSINESS
 *   (LEGACY: BASIC | STARTER | GROWTH — solo webhooks de suscripciones existentes)
 *   LEMONSQUEEZY_VARIANT_PACK_S | PACK_M | PACK_L
 */

import { lemonSqueezySetup } from '@lemonsqueezy/lemonsqueezy.js';
import {
  PAID_PLAN_IDS,
  LEGACY_PLAN_IDS,
  LEGACY_PLAN_PRICES_USD,
  type LegacyPlanId,
  PLAN_CONVERSATION_LIMITS,
  PLAN_DISPLAY,
  PLAN_FEATURE_BULLETS,
  type PaidPlanId,
} from '@/lib/plan-catalog';

let _ready = false;

export function ensureLSSetup() {
  if (_ready) return;
  lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY || '' });
  _ready = true;
}

export const LS_STORE_ID = parseInt(process.env.LEMONSQUEEZY_STORE_ID || '0', 10);

const VARIANT_ENV: Record<PaidPlanId, string> = {
  solo:     process.env.LEMONSQUEEZY_VARIANT_SOLO     || '',
  team:     process.env.LEMONSQUEEZY_VARIANT_TEAM     || '',
  plus:     process.env.LEMONSQUEEZY_VARIANT_PLUS     || '',
  business: process.env.LEMONSQUEEZY_VARIANT_BUSINESS || '',
};

const LEGACY_VARIANT_ENV: Record<LegacyPlanId, string> = {
  basic:   process.env.LEMONSQUEEZY_VARIANT_BASIC   || '',
  starter: process.env.LEMONSQUEEZY_VARIANT_STARTER || '',
  growth:  process.env.LEMONSQUEEZY_VARIANT_GROWTH  || '',
};

function convLabel(planId: PaidPlanId): string {
  const n = PLAN_CONVERSATION_LIMITS[planId];
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k conv/mo`;
  return `${n} conv/mo`;
}

export const PLANS = Object.fromEntries(
  PAID_PLAN_IDS.map((id) => [
    id,
    {
      name: PLAN_DISPLAY[id].label,
      price: PLAN_DISPLAY[id].priceUsd,
      priceId: VARIANT_ENV[id],
      requests: convLabel(id),
      features: PLAN_FEATURE_BULLETS[id],
    },
  ]),
) as Record<
  PaidPlanId,
  {
    name: string;
    price: number;
    priceId: string;
    requests: string;
    features: string[];
  }
>;

/** Mapea un variant ID de LS al nombre de plan interno */
export function planFromLSVariantId(variantId: string | number | undefined): string | null {
  if (!variantId) return null;
  const v = String(variantId);
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.priceId === v) return key;
  }
  for (const [key, variantId] of Object.entries(LEGACY_VARIANT_ENV)) {
    if (variantId === v) return key;
  }
  return null;
}

/** Mapea el status de LS al status interno de la BD */
export function mapLSStatusToDb(status: string | undefined): string {
  switch (status) {
    case 'on_trial':  return 'trialing';
    case 'active':    return 'active';
    case 'paused':
    case 'past_due':
    case 'unpaid':    return 'past_due';
    case 'cancelled':
    case 'expired':   return 'canceled';
    default:          return 'past_due';
  }
}
