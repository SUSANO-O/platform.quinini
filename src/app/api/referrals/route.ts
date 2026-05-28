/**
 * GET  /api/referrals       → obtener código + stats del referidor
 * POST /api/referrals/apply → aplicar código de referido (al registrarse)
 *
 * Mecánica:
 * - Cada usuario tiene un código único generado al primer GET.
 * - Al aplicar el código, el referido recibe 150 conversaciones bonus.
 * - El referidor recibe 150 conversaciones por cada referido exitoso.
 * - Los bonos se otorgan como ConversationPacks de 90 días.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Referral, ConversationPack, User } from '@/lib/db/models';

const REFERRAL_BONUS_CONVERSATIONS = 150;
const REFERRAL_PACK_DAYS = 90;

function auth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

function generateCode(userId: string): string {
  return 'ref_' + crypto.createHash('sha256').update(userId + 'salt').digest('hex').slice(0, 10);
}

export async function GET(req: NextRequest) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();

  let referral = await Referral.findOne({ referrerId: userId }).lean() as {
    code: string;
    referredUsers: string[];
    bonusGranted: number;
  } | null;

  if (!referral) {
    const code = generateCode(userId);
    const created = await Referral.create({
      referrerId: userId,
      code,
      referredUsers: [],
      bonusGranted: 0,
      bonusPending: 0,
    });
    referral = { code: created.code, referredUsers: [], bonusGranted: 0 };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const referralLink = `${appUrl}/register?ref=${referral.code}`;

  return NextResponse.json({
    code: referral.code,
    referralLink,
    referredCount: referral.referredUsers.length,
    bonusEarned: referral.bonusGranted,
    bonusPerReferral: REFERRAL_BONUS_CONVERSATIONS,
  });
}

// POST /api/referrals/apply — used at registration
export async function POST(req: NextRequest) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const body = await req.json() as { code?: string };
  const code = body.code?.trim();
  if (!code) return NextResponse.json({ error: 'code requerido.' }, { status: 400 });

  await connectDB();

  const referral = await Referral.findOne({ code });
  if (!referral) return NextResponse.json({ error: 'Código de referido inválido.' }, { status: 404 });

  // Can't refer yourself
  if (referral.referrerId === userId) {
    return NextResponse.json({ error: 'No puedes usar tu propio código.' }, { status: 400 });
  }

  // Check if user already used a referral
  const alreadyUsed = await Referral.findOne({ referredUsers: userId });
  if (alreadyUsed) {
    return NextResponse.json({ error: 'Ya usaste un código de referido.' }, { status: 409 });
  }

  const expiresAt = new Date(Date.now() + REFERRAL_PACK_DAYS * 24 * 60 * 60 * 1000);
  const packId = `pack_referral_${Date.now()}`;

  // Grant bonus to new user (referido)
  await ConversationPack.create({
    userId,
    packId,
    conversations: REFERRAL_BONUS_CONVERSATIONS,
    used: 0,
    expiresAt,
    status: 'active',
  });

  // Grant bonus to referrer
  const referrerPackId = `pack_referral_bonus_${Date.now()}`;
  await ConversationPack.create({
    userId: referral.referrerId,
    packId: referrerPackId,
    conversations: REFERRAL_BONUS_CONVERSATIONS,
    used: 0,
    expiresAt,
    status: 'active',
  });

  // Update referral record
  referral.referredUsers.push(userId);
  referral.bonusGranted = (referral.bonusGranted || 0) + REFERRAL_BONUS_CONVERSATIONS;
  await referral.save();

  return NextResponse.json({
    ok: true,
    bonusConversations: REFERRAL_BONUS_CONVERSATIONS,
    message: `¡${REFERRAL_BONUS_CONVERSATIONS} conversaciones bonus activadas!`,
  });
}
