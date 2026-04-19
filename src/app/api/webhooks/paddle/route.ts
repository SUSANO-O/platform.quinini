/**
 * POST /api/webhooks/paddle — COMENTADO. Migrado a /api/webhooks/lemonsqueezy
 * → Ver git history para la implementación completa.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Paddle webhooks desactivados. Usa /api/webhooks/lemonsqueezy.' }, { status: 410 });
}
