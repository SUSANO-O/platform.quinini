/**
 * POST /api/billing/sync-checkout — COMENTADO. Era fallback para Paddle.
 * Con LemonSqueezy no se usa — la sincronización se hace vía webhook.
 * → Ver git history para la implementación completa de Paddle.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'sync-checkout no disponible. La suscripción se activa automáticamente via webhook.' },
    { status: 410 },
  );
}
