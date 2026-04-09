/**
 * POST /api/billing/portal — Stripe Customer Portal (método de pago, facturas, cancelar desde Stripe UI).
 */

import type { NextRequest } from 'next/server';
import { postBillingPortal } from '@/lib/billing';

export async function POST(req: NextRequest) {
  return postBillingPortal(req);
}
