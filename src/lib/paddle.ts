/**
 * Paddle Billing v2 — cliente servidor + catálogo de planes.
 * Equivalente a src/lib/stripe.ts (ahora comentado).
 *
 * Variables de entorno requeridas:
 *   PADDLE_API_KEY             — clave API (pdl_sdbx_... / pdl_live_...)
 *   PADDLE_ENVIRONMENT         — "sandbox" | "production"  (default: sandbox)
 *   PADDLE_PRICE_STARTER       — ID de precio Paddle para Starter  (pri_...)
 *   PADDLE_PRICE_GROWTH        — ID de precio Paddle para Growth
 *   PADDLE_PRICE_BUSINESS      — ID de precio Paddle para Business
 *   PADDLE_PACK_S              — ID de precio Paddle para pack_s (one-time)
 *   PADDLE_PACK_M              — ID de precio Paddle para pack_m
 *   PADDLE_PACK_L              — ID de precio Paddle para pack_l
 *   PADDLE_WEBHOOK_SECRET      — secreto del endpoint de notificaciones (pdl_ntfset_...)
 */

import { Paddle, Environment } from '@paddle/paddle-node-sdk';

export const paddle = new Paddle(process.env.PADDLE_API_KEY || '', {
  environment:
    process.env.PADDLE_ENVIRONMENT === 'production'
      ? Environment.production
      : Environment.sandbox,
});

export const PLANS = {
  starter: {
    name: 'Starter',
    price: 29,
    priceId: process.env.PADDLE_PRICE_STARTER || '',
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
    price: 79,
    priceId: process.env.PADDLE_PRICE_GROWTH || '',
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
    price: 199,
    priceId: process.env.PADDLE_PRICE_BUSINESS || '',
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
