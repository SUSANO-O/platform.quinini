/**
 * ─── STRIPE CLIENT (comentado — migrado a Paddle) ──────────────────────────
 * El nuevo proveedor de pagos en el cliente es Paddle.js.
 * Activa: src/lib/paddle-client.ts
 * ────────────────────────────────────────────────────────────────────────────
 */

// import { loadStripe, type Stripe } from '@stripe/stripe-js';
//
// let stripePromise: Promise<Stripe | null> | null = null;
//
// /** Clave publicable test/live (pk_test_ / pk_live_) */
// export function getStripePromise(): Promise<Stripe | null> | null {
//   const k = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
//   if (!k) return null;
//   if (!stripePromise) stripePromise = loadStripe(k);
//   return stripePromise;
// }

export {};
