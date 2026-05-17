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
  solo: {
    name: 'Solo',
    price: 3,
    priceId: process.env.LEMONSQUEEZY_VARIANT_SOLO || '',
    widgets: 1,
    requests: '300 conv/mo',
    features: [
      '1 widget',
      '300 conversations/month',
      '1 agent · Web Search, Webhook, Gmail',
      'Training videos on YouTube',
      'Training & onboarding included',
      'Email support (42h)',
    ],
  },
  basic: {
    name: 'Basic',
    price: 14,
    priceId: process.env.LEMONSQUEEZY_VARIANT_BASIC || '',
    widgets: 10,
    requests: '1.5k conv/mo',
    features: [
      '10 widgets',
      '1,500 conversations/month',
      '5 agents · Web Search, Webhook, Gmail',
      '30-day history',
      'Training & onboarding included',
      'Email support',
    ],
  },
  starter: {
    name: 'Starter',
    price: 39,
    priceId: process.env.LEMONSQUEEZY_VARIANT_STARTER || '',
    widgets: 60,
    requests: '6k conv/mo',
    features: [
      '60 widgets',
      '6,000 conversations/month',
      '30 agents · RAG 1 GB · Gmail + Slack',
      '90-day history',
      'Training & onboarding included',
      'Email support (48h)',
    ],
  },
  growth: {
    name: 'Growth',
    price: 99,
    priceId: process.env.LEMONSQUEEZY_VARIANT_GROWTH || '',
    widgets: 200,
    requests: '30k conv/mo',
    features: [
      '200 widgets',
      '30,000 conversations/month',
      '100 agents · RAG 10 GB · all integrations',
      '1-year history · advanced analytics',
      'Training & onboarding included',
      'Priority support (24h)',
    ],
  },
  business: {
    name: 'Business',
    price: 349,
    priceId: process.env.LEMONSQUEEZY_VARIANT_BUSINESS || '',
    widgets: 1000,
    requests: '150k conv/mo',
    features: [
      '1,000 widgets',
      '150,000 conversations/month',
      '300 agents · RAG 100 GB · all tools',
      'Unlimited history · MCP integrations',
      'Training & onboarding included',
      'Dedicated support · SLA 99.9%',
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
