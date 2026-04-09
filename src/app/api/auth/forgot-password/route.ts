/**
 * POST /api/auth/forgot-password  { email }
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { generateSecureToken } from '@/lib/auth';
import { sendPasswordResetEmail } from '@/lib/email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit('forgot-password', ip, 3, 15 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json({ error: `Demasiados intentos. Intenta en ${rl.retryAfter}s.` }, { status: 429 });
  }

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email requerido.' }, { status: 400 });

  await connectDB();
  const user = await User.findOne({ email: email.toLowerCase().trim() });

  // Always return success to prevent email enumeration
  if (!user) return NextResponse.json({ ok: true });

  const resetToken = generateSecureToken();
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await User.updateOne({ _id: user._id }, { resetToken, resetTokenExpiry });
  await sendPasswordResetEmail(user.email, user.displayName || user.email.split('@')[0], resetToken).catch((err) =>
    console.error('[ForgotPassword] Email error:', err),
  );

  return NextResponse.json({ ok: true });
}
