/**
 * Verifica cupo de conversaciones por pool (agentes/widget vs API REST).
 * Suma: cuota base del plan + packs activos (solo pool agentes por ahora).
 */

import { connectDB } from '@/lib/db/connection';
import { RequestLog, Subscription, User, ConversationPack } from '@/lib/db/models';
import {
  getConversationLimitForPool,
} from '@/lib/plan-catalog';
import { matchesConversationPool, type ConversationPool } from '@/lib/conversation-pools';
import { sendQuotaWarningEmail } from '@/lib/email';
import { sendPushToUser } from '@/lib/push-notifications';
import { getPlatformGiftCycleKey } from '@/lib/platform-agent-utils';
import { resolveConversationMetering } from '@/lib/metering';
import { isLocalDevLimitsBypass } from '@/lib/dev-limits';

export type { ConversationPool };

export interface QuotaResult {
  allowed: boolean;
  used: number;
  baseLimit: number;
  packLimit: number;
  limit: number;
  plan: string;
  pool: ConversationPool;
  cycleKey?: string;
}

async function shouldSendWarning(sub: { quotaWarningSentMonth?: string } | null, month: string) {
  return sub?.quotaWarningSentMonth !== month;
}

async function countPoolUsage(
  userId: string,
  pool: ConversationPool,
  cycleKey: string,
): Promise<number> {
  const allLogs = (await RequestLog.find({ userId, month: cycleKey })
    .select({ widgetId: 1, count: 1 })
    .lean()) as { widgetId?: string; count?: number }[];

  return allLogs
    .filter((l) => matchesConversationPool(l.widgetId, pool))
    .reduce((sum, l) => sum + (l.count ?? 0), 0);
}

export async function checkConversationQuota(
  userId: string,
  pool: ConversationPool = 'agents',
): Promise<QuotaResult> {
  await connectDB();

  const sub = (await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1, quotaWarningSentMonth: 1, features: 1 })
    .lean()) as {
      plan?: string;
      status?: string;
      quotaWarningSentMonth?: string;
      features?: string[];
    } | null;

  const plan = sub?.plan ?? 'free';
  const status = sub?.status ?? 'free';
  const effectivePlan = ['active', 'trialing'].includes(status) ? plan : 'free';
  const features = sub?.features ?? [];
  const devBypass = isLocalDevLimitsBypass();

  const baseLimit = getConversationLimitForPool(effectivePlan, pool, features);

  let packLimit = 0;
  if (pool === 'agents') {
    const activePacks = (await ConversationPack.find({
      userId,
      status: 'active',
      expiresAt: { $gt: new Date() },
    })
      .select({ conversations: 1, used: 1 })
      .lean()) as { conversations: number; used: number }[];
    packLimit = activePacks.reduce(
      (acc, p) => acc + Math.max(0, p.conversations - p.used),
      0,
    );
  }

  const cycleKey = await getPlatformGiftCycleKey(userId);
  const used = await countPoolUsage(userId, pool, cycleKey);

  if (baseLimit === -1) {
    return {
      allowed: true,
      used,
      baseLimit: -1,
      packLimit,
      limit: -1,
      plan: effectivePlan,
      pool,
      cycleKey,
    };
  }

  if (baseLimit === 0 && packLimit === 0) {
    return {
      allowed: devBypass,
      used,
      baseLimit: 0,
      packLimit: 0,
      limit: 0,
      plan: effectivePlan,
      pool,
      cycleKey,
    };
  }

  const totalLimitBase = baseLimit + packLimit;
  const metering = await resolveConversationMetering({
    channel: pool === 'api' ? 'api' : 'widget_production',
    userId,
  });
  const totalLimit = Math.max(0, Math.floor(totalLimitBase * metering.limitMultiplier));

  const percent = totalLimit > 0 ? (used / totalLimit) * 100 : 100;

  if (!devBypass && pool === 'agents' && percent >= 80 && percent < 100) {
    if (await shouldSendWarning(sub, cycleKey)) {
      Promise.all([
        Subscription.updateOne({ userId }, { $set: { quotaWarningSentMonth: cycleKey } }),
        User.findById(userId)
          .select({ email: 1, displayName: 1, pushSubscription: 1 })
          .lean()
          .then((u: unknown) => {
            const user = u as {
              email?: string;
              displayName?: string;
              pushSubscription?: unknown;
            } | null;
            if (!user) return;
            const tasks: Promise<unknown>[] = [];
            if (user.email) {
              tasks.push(
                sendQuotaWarningEmail(
                  user.email,
                  user.displayName || '',
                  used,
                  totalLimit,
                  effectivePlan,
                ),
              );
            }
            if (user.pushSubscription) {
              tasks.push(
                sendPushToUser(user.pushSubscription, {
                  title: `Cuota al ${Math.round(percent)}%`,
                  body: `Has usado ${used.toLocaleString('es')} de ${totalLimit.toLocaleString('es')} conversaciones de agentes de tu plan ${effectivePlan}.`,
                  url: '/dashboard',
                  tag: 'quota-warning',
                }),
              );
            }
            return Promise.all(tasks);
          }),
      ]).catch(() => {});
    }
  }

  return {
    allowed: devBypass || used < totalLimit,
    used,
    baseLimit,
    packLimit,
    limit: totalLimit,
    plan: effectivePlan,
    pool,
    cycleKey,
  };
}

/**
 * Descuenta 1 conversación del pack más antiguo activo (solo pool agentes).
 */
export async function consumePackConversation(userId: string): Promise<void> {
  await connectDB();
  const cycleKey = await getPlatformGiftCycleKey(userId);

  const allLogs = (await RequestLog.find({ userId, month: cycleKey })
    .select({ widgetId: 1, count: 1 })
    .lean()) as { widgetId?: string; count?: number }[];
  const used = allLogs
    .filter((l) => matchesConversationPool(l.widgetId, 'agents'))
    .reduce((sum, l) => sum + (l.count ?? 0), 0);

  const sub = (await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1 })
    .lean()) as { plan?: string; status?: string } | null;
  const effectivePlan = ['active', 'trialing'].includes(sub?.status || '')
    ? (sub?.plan || 'free')
    : 'free';
  const baseLimit = getConversationLimitForPool(effectivePlan, 'agents');

  if (baseLimit !== -1 && used > baseLimit) {
    await ConversationPack.findOneAndUpdate(
      {
        userId,
        status: 'active',
        expiresAt: { $gt: new Date() },
        $expr: { $lt: ['$used', '$conversations'] },
      },
      { $inc: { used: 1 } },
      { sort: { createdAt: 1 } },
    ).then(async (pack: { _id: unknown; conversations: number; used: number } | null) => {
      if (pack && pack.used + 1 >= pack.conversations) {
        await ConversationPack.updateOne({ _id: pack._id }, { $set: { status: 'exhausted' } });
      }
    });
  }
}
