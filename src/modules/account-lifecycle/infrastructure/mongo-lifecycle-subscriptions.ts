import { connectDB } from '@/lib/db/connection';
import { Subscription, User } from '@/lib/db/models';
import type { ILifecycleSubscriptions, LifecycleCandidate } from '../ports/ILifecycleSubscriptions';

type SubRow = {
  _id: { toString(): string };
  userId: string;
  plan?: string;
  status?: string;
  currentPeriodEnd?: number;
  lsSubscriptionId?: string | null;
  paddleSubscriptionId?: string | null;
  reminderHistory?: string[];
};
type UserRow = { _id: { toString(): string }; email?: string; displayName?: string | null; role?: string };

const SELECT = { userId: 1, plan: 1, status: 1, currentPeriodEnd: 1, lsSubscriptionId: 1, paddleSubscriptionId: 1, reminderHistory: 1 };

function toCandidate(sub: SubRow, owner: UserRow): LifecycleCandidate {
  return {
    subscriptionId: sub._id.toString(),
    userId: sub.userId,
    email: owner.email as string,
    displayName: owner.displayName ?? null,
    status: sub.status || 'active',
    plan: sub.plan || 'free',
    currentPeriodEnd: sub.currentPeriodEnd || 0,
    lsSubscriptionId: sub.lsSubscriptionId ?? null,
    paddleSubscriptionId: sub.paddleSubscriptionId ?? null,
    reminderHistory: sub.reminderHistory || [],
  };
}

/** Suscripciones y marcas de avisos sobre Mongo. */
export const mongoLifecycleSubscriptions: ILifecycleSubscriptions = {
  async listExpired(nowSec: number): Promise<LifecycleCandidate[]> {
    await connectDB();
    // Solo vencidas y no canceladas: la política nunca alcanza a quien se fue
    // por decisión propia ni a quien está al día.
    const subs = (await Subscription.find({
      status: { $ne: 'canceled' },
      currentPeriodEnd: { $gt: 0, $lte: nowSec },
    }).select(SELECT).limit(5000).lean()) as SubRow[];
    if (!subs.length) return [];

    const owners = (await User.find({ _id: { $in: subs.map((s) => s.userId) }, role: { $ne: 'admin' } })
      .select({ email: 1, displayName: 1, role: 1 })
      .lean()) as UserRow[];
    const byId = new Map(owners.map((u) => [u._id.toString(), u]));

    return subs
      .map((s) => {
        const owner = byId.get(s.userId);
        return owner?.email ? toCandidate(s, owner) : null;
      })
      .filter((c): c is LifecycleCandidate => c !== null);
  },

  async findByUserId(userId: string): Promise<LifecycleCandidate | null> {
    await connectDB();
    const sub = (await Subscription.findOne({ userId }).select(SELECT).lean()) as SubRow | null;
    if (!sub) return null;
    const owner = (await User.findById(userId).select({ email: 1, displayName: 1, role: 1 }).lean()) as UserRow | null;
    if (!owner?.email) return null;
    return toCandidate(sub, owner);
  },

  async recordNotice(subscriptionId: string, mark: string): Promise<void> {
    await connectDB();
    await Subscription.updateOne({ _id: subscriptionId }, { $addToSet: { reminderHistory: mark } });
  },
};
