import { connectDB } from '@/lib/db/connection';
import { Subscription, User } from '@/lib/db/models';
import { sendSubscriptionReminderEmail } from '@/lib/email';

const REMINDER_DAYS = [15, 7, 3, 1, 0] as const;

type ReminderKind = 'trial' | 'renewal';
type ReminderPlan = 'free' | 'starter' | 'growth' | 'business' | 'enterprise';

type SubDoc = {
  _id: { toString(): string };
  userId: string;
  plan?: ReminderPlan;
  status?: string;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: number;
  reminderHistory?: string[];
};

type UserDoc = {
  _id: { toString(): string };
  email: string;
  displayName?: string | null;
  role?: string;
};

export type RunSubscriptionReminderOptions = {
  dryRun?: boolean;
  kinds?: ReminderKind[];
  plans?: ReminderPlan[];
  limit?: number;
};

export type RunSubscriptionReminderResult = {
  ok: true;
  dryRun: boolean;
  checkedSubscriptions: number;
  remindersFound: number;
  remindersSent: number;
  filters: {
    kinds: ReminderKind[];
    plans: ReminderPlan[];
    limit: number;
  };
  report: Array<{
    userId: string;
    email: string;
    kind: ReminderKind;
    daysLeft: number;
    dueDate: string;
    sent: boolean;
  }>;
};

function daysUntil(targetMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((targetMs - nowMs) / (1000 * 60 * 60 * 24)));
}

function pickReminderDay(daysLeft: number): number | null {
  return REMINDER_DAYS.includes(daysLeft as (typeof REMINDER_DAYS)[number]) ? daysLeft : null;
}

export async function runSubscriptionReminders(
  options: RunSubscriptionReminderOptions = {},
): Promise<RunSubscriptionReminderResult> {
  const dryRun = options.dryRun !== false;
  const kinds = (options.kinds && options.kinds.length ? options.kinds : ['trial', 'renewal']) as ReminderKind[];
  const plans = (options.plans && options.plans.length
    ? options.plans
    : ['free', 'starter', 'growth', 'business', 'enterprise']) as ReminderPlan[];
  const limit = Math.max(1, Math.min(options.limit ?? 500, 5000));

  await connectDB();

  const [subs, users] = await Promise.all([
    Subscription.find({ plan: { $in: plans } })
      .select({ userId: 1, plan: 1, status: 1, trialEndsAt: 1, currentPeriodEnd: 1, reminderHistory: 1 })
      .limit(limit)
      .lean() as Promise<SubDoc[]>,
    User.find({ role: { $ne: 'admin' } })
      .select({ email: 1, displayName: 1, role: 1 })
      .lean() as Promise<UserDoc[]>,
  ]);

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));
  const nowMs = Date.now();
  const marksToWrite = new Map<string, string[]>();
  const report: RunSubscriptionReminderResult['report'] = [];

  for (const sub of subs) {
    const owner = userMap.get(sub.userId);
    if (!owner?.email) continue;

    const already = new Set(sub.reminderHistory || []);
    const plan = sub.plan || 'free';
    const status = sub.status || 'trialing';

    if (kinds.includes('trial') && sub.trialEndsAt) {
      const trialMs = new Date(sub.trialEndsAt).getTime();
      if (trialMs > nowMs) {
        const day = pickReminderDay(daysUntil(trialMs, nowMs));
        if (day != null) {
          const mark = `trial:${day}:${new Date(trialMs).toISOString().slice(0, 10)}`;
          if (!already.has(mark)) {
            if (!dryRun) {
              await sendSubscriptionReminderEmail({
                to: owner.email,
                displayName: owner.displayName,
                kind: 'trial',
                daysLeft: day,
                plan,
                dueDate: new Date(trialMs),
              });
            }
            marksToWrite.set(sub._id.toString(), [...(marksToWrite.get(sub._id.toString()) || []), mark]);
            report.push({
              userId: sub.userId,
              email: owner.email,
              kind: 'trial',
              daysLeft: day,
              dueDate: new Date(trialMs).toISOString(),
              sent: !dryRun,
            });
          }
        }
      }
    }

    if (kinds.includes('renewal') && sub.currentPeriodEnd && sub.currentPeriodEnd > 0 && ['active', 'past_due'].includes(status)) {
      const periodMs = sub.currentPeriodEnd * 1000;
      if (periodMs > nowMs) {
        const day = pickReminderDay(daysUntil(periodMs, nowMs));
        if (day != null) {
          const mark = `renewal:${day}:${new Date(periodMs).toISOString().slice(0, 10)}`;
          if (!already.has(mark)) {
            if (!dryRun) {
              await sendSubscriptionReminderEmail({
                to: owner.email,
                displayName: owner.displayName,
                kind: 'renewal',
                daysLeft: day,
                plan,
                dueDate: new Date(periodMs),
              });
            }
            marksToWrite.set(sub._id.toString(), [...(marksToWrite.get(sub._id.toString()) || []), mark]);
            report.push({
              userId: sub.userId,
              email: owner.email,
              kind: 'renewal',
              daysLeft: day,
              dueDate: new Date(periodMs).toISOString(),
              sent: !dryRun,
            });
          }
        }
      }
    }
  }

  if (!dryRun) {
    for (const [subId, marks] of marksToWrite.entries()) {
      if (!marks.length) continue;
      await Subscription.updateOne({ _id: subId }, { $addToSet: { reminderHistory: { $each: marks } } });
    }
  }

  return {
    ok: true,
    dryRun,
    checkedSubscriptions: subs.length,
    remindersFound: report.length,
    remindersSent: dryRun ? 0 : report.length,
    filters: { kinds, plans, limit },
    report: report.slice(0, 80),
  };
}
