/**
 * GET /api/billing/usage
 * Devuelve uso de conversaciones del mes actual + packs activos.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { checkConversationQuota } from '@/lib/quota';
import { connectDB } from '@/lib/db/connection';
import { ConversationPack, PlatformUsage } from '@/lib/db/models';
import { PLATFORM_AGENT_FREE_REQUESTS_PER_USER_MONTH } from '@/lib/agent-plans';
import { getPlatformGiftCycleKey } from '@/lib/platform-agent-utils';

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
    const platformCycleKey = await getPlatformGiftCycleKey(userId);
    const [platformCycleRow, platformLegacyMonthRow] = await Promise.all([
      PlatformUsage.findOne({ userId, month: platformCycleKey }).select({ platformFreeUsed: 1 }).lean(),
      PlatformUsage.findOne({ userId, month }).select({ platformFreeUsed: 1 }).lean(),
    ]) as [{ platformFreeUsed?: number } | null, { platformFreeUsed?: number } | null];
    const platformRow = platformCycleRow ?? platformLegacyMonthRow;
    const platformFreeUsed = Math.max(0, platformRow?.platformFreeUsed ?? 0);
    const platformFreeLimit = PLATFORM_AGENT_FREE_REQUESTS_PER_USER_MONTH;
    const platformFreeRemaining = Math.max(0, platformFreeLimit - platformFreeUsed);
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
      platformCycleKey,
      platformFreeLimit,
      platformFreeUsed,
      platformFreeRemaining,
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
