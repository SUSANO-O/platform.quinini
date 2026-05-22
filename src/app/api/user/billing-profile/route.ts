/**
 * GET/PUT /api/user/billing-profile — datos fiscales para recibos PDF.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { normalizeBillingProfile, type BillingProfile } from '@/lib/billing-profile';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  const user = await User.findById(userId).select({ billingProfile: 1, email: 1, displayName: 1 }).lean();
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  const profile = normalizeBillingProfile(user.billingProfile);
  return NextResponse.json({
    profile,
    email: user.email ?? '',
    displayName: user.displayName ?? '',
  });
}

export async function PUT(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as BillingProfile;
  const profile = normalizeBillingProfile(body);

  await connectDB();
  await User.findByIdAndUpdate(userId, { $set: { billingProfile: profile } });

  return NextResponse.json({ ok: true, profile });
}
