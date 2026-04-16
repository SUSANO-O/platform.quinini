/**
 * POST /api/auth/reset-password  { token, password }
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { hashPassword } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  // 5 intentos por IP por hora — evita enumeración de tokens de reset
  const ip = getClientIp(req);
  const rl = checkRateLimit('password-reset', ip, 5, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Espera antes de volver a intentarlo.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const { token, password } = await req.json();
  if (!token || !password) return NextResponse.json({ error: 'Token y contraseña requeridos.' }, { status: 400 });

  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
  }

  await connectDB();

  const user = await User.findOne({
    resetToken: token,
    resetTokenExpiry: { $gt: new Date() },
  });

  if (!user) {
    return NextResponse.json({ error: 'Token inválido o expirado. Solicita un nuevo enlace.' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  await User.updateOne(
    { _id: user._id },
    { passwordHash, hashVersion: 'v2-bcrypt', resetToken: null, resetTokenExpiry: null },
  );

  return NextResponse.json({ ok: true, message: 'Contraseña actualizada.' });
}
