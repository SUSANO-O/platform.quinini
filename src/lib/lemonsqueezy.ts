/**
 * LemonSqueezy — cliente servidor + catálogo de planes.
 * Reemplaza src/lib/paddle.ts
 *
 * Variables de entorno requeridas:
 *   LEMONSQUEEZY_API_KEY               — clave API (lssk_...)
 *   LEMONSQUEEZY_STORE_ID              — ID numérico de la tienda
 *   LEMONSQUEEZY_WEBHOOK_SECRET        — secreto del endpoint de webhooks
 *   LEMONSQUEEZY_VARIANT_STARTER       — ID de variante Starter
 *   LEMONSQUEEZY_VARIANT_GROWTH        — ID de variante Growth
 *   LEMONSQUEEZY_VARIANT_BUSINESS      — ID de variante Business (numérico; debe existir en esa tienda; para cambios in-place LS suele exigir variantes del mismo producto de suscripción)
 *   LEMONSQUEEZY_VARIANT_PACK_S        — ID de variante pack_s (one-time)
 *   LEMONSQUEEZY_VARIANT_PACK_M        — ID de variante pack_m
 *   LEMONSQUEEZY_VARIANT_PACK_L        — ID de variante pack_l
 */

import { lemonSqueezySetup } from '@lemonsqueezy/lemonsqueezy.js';

let _ready = false;

export function ensureLSSetup() {
  if (_ready) return;
  lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY || '' });
  _ready = true;
}

export const LS_STORE_ID = parseInt(process.env.LEMONSQUEEZY_STORE_ID || '0', 10);

export const PLANS = {
  starter: {
    name: 'Starter',
    price: 39,
    priceId: process.env.LEMONSQUEEZY_VARIANT_STARTER || '',
    widgets: 2,
    requests: '5k conv/mo',
    features: [
      '2 widgets',
      '5,000 conversations/month',
      'Chat AI',
      'Basic analytics',
      'Email support',
    ],
  },
  growth: {
    name: 'Growth',
    price: 99,
    priceId: process.env.LEMONSQUEEZY_VARIANT_GROWTH || '',
    widgets: 5,
    requests: '25k conv/mo',
    features: [
      '5 widgets',
      '25,000 conversations/month',
      'Chat AI + RAG',
      'Advanced analytics + CSV export',
      'Priority support',
    ],
  },
  business: {
    name: 'Business',
    price: 349,
    priceId: process.env.LEMONSQUEEZY_VARIANT_BUSINESS || '',
    widgets: 15,
    requests: '100k conv/mo',
    features: [
      '15 widgets',
      '100,000 conversations/month',
      'All features + MCP integrations',
      'Dedicated support',
      'SLA 99.9%',
      'Onboarding included',
    ],
  },
} as const;

/** Mapea un variant ID de LS al nombre de plan interno */
export function planFromLSVariantId(variantId: string | number | undefined): string | null {
  if (!variantId) return null;
  const v = String(variantId);
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.priceId === v) return key;
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
