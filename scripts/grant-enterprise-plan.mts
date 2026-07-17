/**
 * Asigna plan enterprise + todos los feature overrides (mismo paquete que cuenta plataforma).
 *
 *   npx tsx --env-file=.env scripts/grant-enterprise-plan.mts <email>
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { Subscription, User } from '../src/lib/db/models.ts';
import { VALID_FEATURE_OVERRIDES } from '../src/lib/plan-catalog.ts';

const email = (process.argv[2] || '').toLowerCase().trim();
if (!email) {
  console.error('Uso: npx tsx --env-file=.env scripts/grant-enterprise-plan.mts <email>');
  process.exit(1);
}

async function main() {
  await connectDB();

  const user = await User.findOne({ email }).select({ _id: 1, email: 1, role: 1 });
  if (!user) {
    console.error('Usuario no encontrado:', email);
    process.exit(1);
  }

  const userId = String(user._id);
  const now = Math.floor(Date.now() / 1000);
  const periodEnd = now + 365 * 24 * 60 * 60;

  const sub = await Subscription.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        plan: 'enterprise',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        planManagedBy: 'admin',
        features: [...VALID_FEATURE_OVERRIDES],
        scheduledTaskLimit: -1,
        trialStartedAt: null,
        trialEndsAt: null,
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true },
  );

  console.log('OK', {
    email,
    userId,
    role: user.role,
    plan: sub?.plan,
    status: sub?.status,
    features: sub?.features?.length,
    scheduledTaskLimit: sub?.scheduledTaskLimit,
    periodEnd: new Date((sub?.currentPeriodEnd || periodEnd) * 1000).toISOString(),
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
