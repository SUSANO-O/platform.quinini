/**
 * ─── STRIPE (comentado — migrado a Paddle) ─────────────────────────────────
 * Conservado para referencia. El nuevo proveedor de pagos es Paddle Billing v2.
 * Activa: src/lib/paddle.ts + src/lib/payment/
 * ────────────────────────────────────────────────────────────────────────────
 */

// import Stripe from 'stripe';
//
// export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
//   apiVersion: '2025-04-30.basil',
// });
//
// export const PLANS = {
//   starter: {
//     name: 'Starter',
//     price: 29,
//     priceId: process.env.STRIPE_PRICE_STARTER || '',
//     widgets: 2,
//     requests: '5k conv/mo',
//     features: ['2 widgets', '5,000 conversations/month', 'Chat AI', 'Basic analytics', 'Email support'],
//   },
//   growth: {
//     name: 'Growth',
//     price: 79,
//     priceId: process.env.STRIPE_PRICE_GROWTH || '',
//     widgets: 5,
//     requests: '25k conv/mo',
//     features: ['5 widgets', '25,000 conversations/month', 'Chat AI + RAG', 'Advanced analytics + CSV export', 'Priority support'],
//   },
//   business: {
//     name: 'Business',
//     price: 199,
//     priceId: process.env.STRIPE_PRICE_BUSINESS || '',
//     widgets: 15,
//     requests: '100k conv/mo',
//     features: ['15 widgets', '100,000 conversations/month', 'All features + MCP integrations', 'Dedicated support', 'SLA 99.9%', 'Onboarding included'],
//   },
// } as const;

// Re-exportar desde LemonSqueezy para compatibilidad con imports existentes
export { PLANS } from '@/lib/lemonsqueezy';
