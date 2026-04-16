/**
 * GET /api/auth/verify-email?token=xxx
 * POST /api/auth/verify-email/resend  { email }
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { generateSecureToken } from '@/lib/auth';
import { sendVerificationEmail, type EmailSendResult } from '@/lib/email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token requerido.' }, { status: 400 });

  await connectDB();

  const user = await User.findOne({
    verifyToken: token,
    verifyTokenExpiry: { $gt: new Date() },
  });

  if (!user) {
    return NextResponse.json({ error: 'Token inválido o expirado.' }, { status: 400 });
  }

  await User.updateOne(
    { _id: user._id },
    { emailVerified: true, verifyToken: null, verifyTokenExpiry: null },
  );

  console.log(
    '[verify-email API] GET: correo marcado como verificado en BD (esta petición no envía email; solo confirma el token).',
    { email: user.email },
  );

  return NextResponse.json({ ok: true, message: 'Email verificado correctamente.' });
}

export async function POST(req: NextRequest) {
  // Resend verification email
  const ip = getClientIp(req);
  const rl = checkRateLimit('verify-resend', ip, 3, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json({ error: `Intenta en ${rl.retryAfter}s.` }, { status: 429 });
  }

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email requerido.' }, { status: 400 });

  await connectDB();
  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (!user) {
    // Don't reveal whether email exists
    return NextResponse.json({ ok: true });
  }

  if (user.emailVerified) {
    return NextResponse.json({ ok: true, message: 'Email ya verificado.' });
  }

  const verifyToken = generateSecureToken();
  const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await User.updateOne({ _id: user._id }, { verifyToken, verifyTokenExpiry });

  console.log(
    '[verify-email API] POST: reenvío de verificación → siguiente línea en esta misma terminal debe ser [Email] SIMULADO o [Email] Enviado OK (Resend).',
    { to: user.email },
  );

  const sent: EmailSendResult = await sendVerificationEmail(
    user.email,
    user.displayName || user.email.split('@')[0],
    verifyToken,
    'resend',
  );

  if (!sent.ok) {
    console.error('[verify-email API] POST: fallo al enviar:', sent);
    return NextResponse.json(
      {
        ok: false,
        error:
          sent.code === 'no_api_key'
            ? 'El servicio de correo no está configurado (falta RESEND_API_KEY en el servidor).'
            : `No se pudo enviar el correo: ${sent.message}. Comprueba EMAIL_FROM y que el dominio esté verificado en Resend.`,
        code: sent.code,
      },
      { status: 502 },
    );
  }

  console.log('[verify-email API] POST: Resend aceptó el envío (revisa también dashboard de Resend).');
  return NextResponse.json({ ok: true });
}
