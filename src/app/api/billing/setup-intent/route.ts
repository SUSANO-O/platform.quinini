/**
 * ─── STRIPE SetupIntent (comentado — migrado a Paddle) ─────────────────────
 * Paddle no usa SetupIntent. Para actualizar el método de pago, usa:
 *   POST /api/billing/payment-method-url  →  redirige a la URL de Paddle
 * ────────────────────────────────────────────────────────────────────────────
 */

// import type { NextRequest } from 'next/server';
// import { postCreateSetupIntent } from '@/lib/billing';
//
// export async function POST(req: NextRequest) {
//   return postCreateSetupIntent(req);
// }

export {};
