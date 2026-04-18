/**
 * POST /api/user/email/confirm  { newEmail: string, code: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, hashEmailChangeCode, isUserEmailVerified, isImpersonationSession } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User, Subscription as SubscriptionModel } from '@/lib/db/models';
import { paddle } from '@/lib/paddle';
// import { stripe } from '@/lib/stripe'; // Stripe — comentado
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit('email-change-confirm', ip, 20, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  let newEmail = '';
  let code = '';
  try {
    const body = await req.json();
    newEmail = typeof body.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : '';
    code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (!newEmail || !code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Email y código de 6 dígitos requeridos.' }, { status: 400 });
  }

  await connectDB();
  const user = await User.findById(userId);
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  if (!isImpersonationSession(req.cookies) && !isUserEmailVerified(user)) {
    return NextResponse.json(
      {
        error: 'Verifica tu correo actual antes de confirmar un cambio de email.',
        code: 'EMAIL_NOT_VERIFIED',
      },
      { status: 403 },
    );
  }

  if (!user.pendingEmail || user.pendingEmail !== newEmail) {
    return NextResponse.json(
      { error: 'No hay una solicitud pendiente para ese email. Solicita un nuevo código.' },
      { status: 400 },
    );
  }

  if (!user.emailChangeExpires || user.emailChangeExpires < new Date()) {
    return NextResponse.json({ error: 'El código ha expirado. Solicita uno nuevo.' }, { status: 400 });
  }

  const expected = hashEmailChangeCode(code, userId);
  if (!user.emailChangeCodeHash || user.emailChangeCodeHash !== expected) {
    return NextResponse.json({ error: 'Código incorrecto.' }, { status: 400 });
  }

  const other = await User.findOne({ email: newEmail, _id: { $ne: userId } });
  if (other) {
    return NextResponse.json({ error: 'Ese email ya está en uso.' }, { status: 409 });
  }

  try {
    await User.updateOne(
      { _id: userId },
      {
        $set: { email: newEmail },
        $unset: {
          pendingEmail: 1,
          emailChangeCodeHash: 1,
          emailChangeExpires: 1,
        },
      },
    );
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: unknown }).code : null;
    if (code === 11000) {
      return NextResponse.json({ error: 'Ese email ya está en uso.' }, { status: 409 });
    }
    throw err;
  }

  // Actualizar email del cliente en Paddle (equivalente al bloque de Stripe)
  if (process.env.PADDLE_API_KEY) {
    try {
      const sub = await SubscriptionModel.findOne({ userId });
      if (sub?.paddleCustomerId) {
        await paddle.customers.update(sub.paddleCustomerId, { email: newEmail });
      }
    } catch (e) {
      console.error('[Email confirm] Paddle customer update:', e);
    }
  }

  // ── Stripe (comentado) ──────────────────────────────────────────────────
  // if (process.env.STRIPE_SECRET_KEY) {
  //   try {
  //     const sub = await SubscriptionModel.findOne({ userId });
  //     if (sub?.stripeCustomerId) {
  //       await stripe.customers.update(sub.stripeCustomerId, { email: newEmail });
  //     }
  //   } catch (e) {
  //     console.error('[Email confirm] Stripe customer update:', e);
  //   }
  // }

  return NextResponse.json({
    ok: true,
    message: 'Email actualizado correctamente.',
    user: {
      uid: userId,
      email: newEmail,
      displayName: user.displayName,
      role: user.role || 'user',
      emailVerified: user.emailVerified ?? true,
    },
  });
}
