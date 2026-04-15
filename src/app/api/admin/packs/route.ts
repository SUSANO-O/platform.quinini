/**
 * GET /api/admin/packs
 * Returns all conversation pack purchases with user details.
 * Admin-only endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ConversationPack, User } from '@/lib/db/models';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  await connectDB();

  const requestingUser = await User.findById(userId).select({ role: 1 }).lean() as { role?: string } | null;
  if (requestingUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
  }

  const packs = await ConversationPack.find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .lean() as {
      _id: unknown;
      userId: string;
      packId: string;
      conversations: number;
      used: number;
      status: string;
      expiresAt: Date;
      stripeSessionId?: string;
      createdAt?: Date;
    }[];

  // Fetch user emails in batch
  const userIds = [...new Set(packs.map((p) => p.userId))];
  const users = await User.find({ _id: { $in: userIds } })
    .select({ _id: 1, email: 1 })
    .lean() as { _id: unknown; email: string }[];

  const emailMap: Record<string, string> = {};
  for (const u of users) {
    emailMap[String(u._id)] = u.email;
  }

  const PACK_LABELS: Record<string, string> = {
    pack_s: 'Pack S — 1,000 conv',
    pack_m: 'Pack M — 5,000 conv',
    pack_l: 'Pack L — 15,000 conv',
  };
  const PACK_PRICES: Record<string, number> = {
    pack_s: 4,
    pack_m: 15,
    pack_l: 39,
  };

  const totalRevenue = packs.reduce((sum, p) => sum + (PACK_PRICES[p.packId] ?? 0), 0);
  const totalConversationsSold = packs.reduce((sum, p) => sum + p.conversations, 0);

  return NextResponse.json({
    totalRevenue,
    totalConversationsSold,
    totalPacks: packs.length,
    packs: packs.map((p) => ({
      id: String(p._id),
      userId: p.userId,
      email: emailMap[p.userId] || '—',
      packId: p.packId,
      label: PACK_LABELS[p.packId] || p.packId,
      conversations: p.conversations,
      used: p.used,
      remaining: Math.max(0, p.conversations - p.used),
      status: p.status,
      price: PACK_PRICES[p.packId] ?? 0,
      expiresAt: p.expiresAt,
      purchasedAt: p.createdAt ?? null,
      stripeSessionId: p.stripeSessionId ?? null,
    })),
  });
}
