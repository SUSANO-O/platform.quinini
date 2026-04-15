/**
 * POST /api/billing/topup
 * Crea una sesión de Stripe Checkout (modo payment, one-time) para comprar
 * un pack de conversaciones extra.
 * Body: { packId: 'pack_s' | 'pack_m' | 'pack_l' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription } from '@/lib/db/models';
import { CONVERSATION_PACKS, type PackId } from '@/lib/plan-catalog';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const PACK_PRICE_IDS: Record<PackId, string> = {
  pack_s: process.env.STRIPE_PACK_S || '',
  pack_m: process.env.STRIPE_PACK_M || '',
  pack_l: process.env.STRIPE_PACK_L || '',
};

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
      { error: 'Pack no configurado (falta STRIPE_PACK_* en .env).' },
      { status: 400 },
    );
  }

  await connectDB();
  const user = await User.findById(userId).lean() as { email?: string } | null;
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  // Obtener o crear Stripe customer
  const sub = await Subscription.findOne({ userId }).lean() as { stripeCustomerId?: string } | null;
  let customerId = sub?.stripeCustomerId;
  if (!customerId) {
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const c = await stripe.customers.create({ email: user.email, metadata: { userId } });
      customerId = c.id;
    }
    await Subscription.findOneAndUpdate({ userId }, { $set: { stripeCustomerId: customerId } }, { upsert: true });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?topup=success&pack=${packId}`,
    cancel_url:  `${appUrl}/dashboard?topup=cancelled`,
    metadata: { userId, packId, conversations: String(pack.conversations), type: 'conversation_pack' },
  });

  if (!session.url) {
    return NextResponse.json({ error: 'No se pudo crear la sesión de pago.' }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
