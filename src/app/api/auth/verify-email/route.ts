/**
 * GET /api/auth/verify-email?token=xxx
 * POST /api/auth/verify-email/resend  { email }
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { generateSecureToken } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';
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
  await sendVerificationEmail(
    user.email,
    user.displayName || user.email.split('@')[0],
    verifyToken,
    'resend',
  );

  return NextResponse.json({ ok: true });
}
