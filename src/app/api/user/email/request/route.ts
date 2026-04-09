/**
 * POST /api/user/email/request  { newEmail: string }
 * Envía código de 6 dígitos al correo nuevo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, hashEmailChangeCode, generateEmailChangeCode } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { sendEmailChangeCodeEmail } from '@/lib/email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit('email-change-req', ip, 8, 60 * 60 * 1000);
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
  try {
    const body = await req.json();
    newEmail = typeof body.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : '';
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (!newEmail || !EMAIL_RE.test(newEmail)) {
    return NextResponse.json({ error: 'Introduce un email válido.' }, { status: 400 });
  }

  await connectDB();
  const user = await User.findById(userId);
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  if (user.email === newEmail) {
    return NextResponse.json({ error: 'Ese ya es tu email actual.' }, { status: 400 });
  }

  const taken = await User.findOne({
    $or: [
      { email: newEmail, _id: { $ne: userId } },
      { pendingEmail: newEmail, _id: { $ne: userId } },
    ],
  });
  if (taken) {
    return NextResponse.json({ error: 'Ese email ya está en uso por otra cuenta.' }, { status: 409 });
  }

  const code = generateEmailChangeCode();
  const hash = hashEmailChangeCode(code, userId);
  const expires = new Date(Date.now() + 15 * 60 * 1000);

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        pendingEmail: newEmail,
        emailChangeCodeHash: hash,
        emailChangeExpires: expires,
      },
    },
  );

  const displayName = user.displayName || user.email.split('@')[0];
  await sendEmailChangeCodeEmail(newEmail, displayName, code).catch((err) => {
    console.error('[Email change] send failed:', err);
  });

  return NextResponse.json({
    ok: true,
    message: 'Hemos enviado un código de 6 dígitos al nuevo correo. Revísalo (y spam).',
  });
}
