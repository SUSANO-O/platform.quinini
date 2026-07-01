/**
 * POST /api/billing/plan  { plan: 'solo' | 'api_develop' | 'team' | 'plus' | 'business' }
 * Suscripción nueva (Checkout) o cambio con proration si ya hay suscripción activa en Stripe.
 */

import type { NextRequest } from 'next/server';
import { postSubscribePlan } from '@/lib/billing';

export async function POST(req: NextRequest) {
  return postSubscribePlan(req);
}
