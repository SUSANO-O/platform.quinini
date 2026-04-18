/**
 * POST /api/billing/payment-method-url
 * Retorna la URL de Paddle para actualizar el método de pago de la suscripción.
 * Reemplaza el flujo Stripe Elements + SetupIntent.
 */

import type { NextRequest } from 'next/server';
import { postGetPaymentMethodUrl } from '@/lib/billing';

export async function POST(req: NextRequest) {
  return postGetPaymentMethodUrl(req);
}
