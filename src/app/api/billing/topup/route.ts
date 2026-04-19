/**
 * POST /api/billing/topup
 * Crea un checkout de Paddle (pago único) para comprar un pack de conversaciones.
 * Body: { packId: 'pack_s' | 'pack_m' | 'pack_l' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, isUserEmailVerified, isImpersonationSession } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription } from '@/lib/db/models';
import { CONVERSATION_PACKS, type PackId } from '@/lib/plan-catalog';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getPaymentService } from '@/lib/payment';

// IDs de variantes LemonSqueezy para packs de conversaciones (one-time)
const PACK_PRICE_IDS: Record<PackId, string> = {
  pack_s: process.env.LEMONSQUEEZY_VARIANT_PACK_S || '',
  pack_m: process.env.LEMONSQUEEZY_VARIANT_PACK_M || '',
  pack_l: process.env.LEMONSQUEEZY_VARIANT_PACK_L || '',
};

// ─── PADDLE (comentado) ──────────────────────────────────────────────────────
// const PACK_PRICE_IDS: Record<PackId, string> = {
//   pack_s: process.env.PADDLE_PACK_S || '',
//   pack_m: process.env.PADDLE_PACK_M || '',
//   pack_l: process.env.PADDLE_PACK_L || '',
// };

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit('billing-topup', ip, 10, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
      { status: 429 },
    );
  }

  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  let packId: PackId;
  try {
    const body = await req.json();
    packId = body?.packId;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const pack = CONVERSATION_PACKS.find((p) => p.id === packId);
  if (!pack) return NextResponse.json({ error: 'Pack no válido.' }, { status: 400 });

  const priceId = PACK_PRICE_IDS[packId];
  if (!priceId) {
    return NextResponse.json(
      { error: 'Pack no configurado (falta PADDLE_PACK_* en .env).' },
      { status: 400 },
    );
  }

  await connectDB();
  const user = await User.findById(userId).lean() as { email?: string; emailVerified?: boolean | null } | null;
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  if (!isImpersonationSession(req.cookies) && !isUserEmailVerified(user)) {
    return NextResponse.json(
      { error: 'Debes verificar tu correo antes de comprar packs de conversaciones.', code: 'EMAIL_NOT_VERIFIED' },
      { status: 403 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const paymentService = getPaymentService();

  try {
    const { url } = await paymentService.createTopupCheckout({
      userId,
      email: user.email!,
      packId,
      priceId,
      conversations: pack.conversations,
      successUrl: `${appUrl}/dashboard?topup=success&pack=${packId}`,
      cancelUrl: `${appUrl}/dashboard?topup=cancelled`,
    });

    // lsCustomerId se guarda desde el webhook order_created; no hace falta crearlo aquí

    return NextResponse.json({ url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Billing] topup:', msg);
    return NextResponse.json({ error: 'No se pudo crear la sesión de pago.' }, { status: 500 });
  }
}
