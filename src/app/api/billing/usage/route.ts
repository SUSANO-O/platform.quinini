/**
 * GET /api/billing/usage
 * Devuelve uso de conversaciones del mes actual + packs activos.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { checkConversationQuota } from '@/lib/quota';
import { connectDB } from '@/lib/db/connection';
import { ConversationPack } from '@/lib/db/models';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  try {
    await connectDB();
    const [quota, packs] = await Promise.all([
      checkConversationQuota(userId),
      ConversationPack.find({
        userId, status: 'active', expiresAt: { $gt: new Date() },
      }).select({ packId: 1, conversations: 1, used: 1, expiresAt: 1 }).lean() as Promise<
        { packId: string; conversations: number; used: number; expiresAt: Date }[]
      >,
    ]);

    const month = new Date().toISOString().slice(0, 7);
    const percentUsed = quota.limit === -1 ? 0 : Math.round((quota.used / quota.limit) * 100);

    return NextResponse.json({
      month,
      used: quota.used,
      baseLimit: quota.baseLimit,
      packLimit: quota.packLimit,
      limit: quota.limit,
      plan: quota.plan,
      percentUsed,
      allowed: quota.allowed,
      activePacks: packs.map((p) => ({
        packId: p.packId,
        remaining: p.conversations - p.used,
        total: p.conversations,
        expiresAt: p.expiresAt,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[Usage] quota:', msg);
    return NextResponse.json({ error: 'No se pudo obtener el uso.' }, { status: 500 });
  }
}
