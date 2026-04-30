/**
 * POST /api/gdpr/delete-account { password, confirmEmail }
 * Borra definitivamente la cuenta y datos asociados en Landing (RGPD).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, verifyPassword, isImpersonationSession, IMPERSONATOR_COOKIE } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { deleteAllPersonalData } from '@/lib/gdpr-pack';
import { getClientIp } from '@/lib/rate-limit';

const COOKIE = 'afhub_session';

export async function POST(req: NextRequest) {
  if (isImpersonationSession(req.cookies)) {
    return NextResponse.json(
      { error: 'No puedes borrar la cuenta mientras impersonas a otro usuario.' },
      { status: 403 },
    );
  }

  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  let body: { password?: string; confirmEmail?: string };
  try {
    body = (await req.json()) as { password?: string; confirmEmail?: string };
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const confirmEmail = typeof body.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : '';
  if (!password || !confirmEmail) {
    return NextResponse.json({ error: 'Contraseña y email de confirmación son obligatorios.' }, { status: 400 });
  }

  await connectDB();
  const user = await User.findById(userId).select({ email: 1, passwordHash: 1, hashVersion: 1 }).lean() as
    | { email?: string; passwordHash?: string; hashVersion?: string }
    | null;
  if (!user?.email || !user.passwordHash) {
    return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
  }

  if (confirmEmail !== String(user.email).toLowerCase()) {
    return NextResponse.json({ error: 'El email no coincide con la cuenta.' }, { status: 400 });
  }

  const { valid } = await verifyPassword(password, user.passwordHash, user.hashVersion || 'v2-bcrypt');
  if (!valid) {
    return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401 });
  }

  const ip = getClientIp(req);
  console.info('[gdpr] delete-account execution', { userId, ip });

  try {
    await deleteAllPersonalData(userId);
  } catch (e) {
    console.error('[gdpr/delete-account]', e);
    return NextResponse.json({ error: 'No se pudo completar el borrado. Contacta soporte.' }, { status: 500 });
  }

  const res = NextResponse.json({
    ok: true,
    message: 'Tu cuenta y datos asociados en esta plataforma han sido eliminados.',
  });
  res.cookies.set(COOKIE, '', { maxAge: 0, path: '/' });
  res.cookies.set(IMPERSONATOR_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
