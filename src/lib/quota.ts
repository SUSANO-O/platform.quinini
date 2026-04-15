/**
 * Verifica si un usuario puede seguir enviando conversaciones este mes.
 * Suma: cuota base del plan + conversaciones de packs activos no vencidos.
 * También dispara email de alerta al 80% (una vez por mes).
 */

import { connectDB } from '@/lib/db/connection';
import { RequestLog, Subscription, User, ConversationPack } from '@/lib/db/models';
import { PLAN_CONVERSATION_LIMITS } from '@/lib/plan-catalog';
import { sendQuotaWarningEmail } from '@/lib/email';

export interface QuotaResult {
  allowed: boolean;
  used: number;
  baseLimit: number;    // cuota del plan
  packLimit: number;    // conversaciones de packs activos
  limit: number;        // baseLimit + packLimit (-1 = ilimitado)
  plan: string;
}

async function shouldSendWarning(sub: { quotaWarningSentMonth?: string } | null, month: string) {
  return sub?.quotaWarningSentMonth !== month;
}

export async function checkConversationQuota(userId: string): Promise<QuotaResult> {
  await connectDB();

  const [sub, activePacks] = await Promise.all([
    Subscription.findOne({ userId })
      .select({ plan: 1, status: 1, quotaWarningSentMonth: 1 })
      .lean() as Promise<{ plan?: string; status?: string; quotaWarningSentMonth?: string } | null>,
    ConversationPack.find({
      userId,
      status: 'active',
      expiresAt: { $gt: new Date() },
    }).select({ conversations: 1, used: 1 }).lean() as Promise<{ conversations: number; used: number }[]>,
  ]);

  const plan        = sub?.plan   || 'free';
  const status      = sub?.status || 'free';
  const effectivePlan = ['active', 'trialing'].includes(status) ? plan : 'free';
  const baseLimit   = PLAN_CONVERSATION_LIMITS[effectivePlan] ?? 50;

  // Conversaciones disponibles en packs (no vencidos)
  const packLimit = activePacks.reduce((acc, p) => acc + Math.max(0, p.conversations - p.used), 0);

  // Si el plan es ilimitado no necesitamos calcular nada más
  if (baseLimit === -1) return { allowed: true, used: 0, baseLimit: -1, packLimit, limit: -1, plan: effectivePlan };

  const totalLimit = baseLimit + packLimit;
  const month = new Date().toISOString().slice(0, 7);

  const logs = await RequestLog.find({ userId, month })
    .select({ count: 1 })
    .lean() as { count?: number }[];

  const used = logs.reduce((sum, l) => sum + (l.count ?? 0), 0);
  const percent = (used / totalLimit) * 100;

  // Alerta al 80% (solo base del plan, no packs) — una vez por mes
  if (percent >= 80 && percent < 100) {
    if (await shouldSendWarning(sub, month)) {
      Promise.all([
        Subscription.updateOne({ userId }, { $set: { quotaWarningSentMonth: month } }),
        User.findById(userId).select({ email: 1, displayName: 1 }).lean().then((u: unknown) => {
          const user = u as { email?: string; displayName?: string } | null;
          if (user?.email) {
            return sendQuotaWarningEmail(user.email, user.displayName || '', used, totalLimit, effectivePlan);
          }
        }),
      ]).catch(() => {});
    }
  }

  return { allowed: used < totalLimit, used, baseLimit, packLimit, limit: totalLimit, plan: effectivePlan };
}

/**
 * Descuenta 1 conversación del pack más antiguo activo.
 * Llámalo tras un chat exitoso cuando el usuario ya superó su base del plan.
 */
export async function consumePackConversation(userId: string): Promise<void> {
  await connectDB();
  const month = new Date().toISOString().slice(0, 7);

  const logs = await RequestLog.find({ userId, month }).select({ count: 1 }).lean() as { count?: number }[];
  const used = logs.reduce((sum, l) => sum + (l.count ?? 0), 0);

  const sub = await Subscription.findOne({ userId }).select({ plan: 1, status: 1 }).lean() as
    | { plan?: string; status?: string } | null;
  const effectivePlan = ['active', 'trialing'].includes(sub?.status || '') ? (sub?.plan || 'free') : 'free';
  const baseLimit = PLAN_CONVERSATION_LIMITS[effectivePlan] ?? 50;

  if (baseLimit !== -1 && used > baseLimit) {
    // Descontar del pack más antiguo con saldo disponible
    await ConversationPack.findOneAndUpdate(
      { userId, status: 'active', expiresAt: { $gt: new Date() }, $expr: { $lt: ['$used', '$conversations'] } },
      { $inc: { used: 1 } },
      { sort: { createdAt: 1 } },
    ).then(async (pack: { _id: unknown; conversations: number; used: number } | null) => {
      if (pack && pack.used + 1 >= pack.conversations) {
        await ConversationPack.updateOne({ _id: pack._id }, { $set: { status: 'exhausted' } });
      }
    });
  }
}
