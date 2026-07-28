import { connectDB } from '@/lib/db/connection';
import { Subscription } from '@/lib/db/models';
import { resolveMetering } from './engine';
import { DEFAULT_METERING_POLICIES } from './policies';
import type { MeteringContext, MeteringDecision, MeteringPolicy } from './types';

type ResolveInput = Partial<MeteringContext> & Pick<MeteringContext, 'channel'>;

async function enrichContext(ctx: ResolveInput): Promise<MeteringContext> {
  const base: MeteringContext = {
    channel: ctx.channel,
    userId: ctx.userId,
    plan: ctx.plan,
    subscriptionStatus: ctx.subscriptionStatus,
    subscriptionFeatures: ctx.subscriptionFeatures,
    widgetId: ctx.widgetId,
    agentId: ctx.agentId,
    at: ctx.at ?? new Date(),
  };

  if (!ctx.userId || ctx.subscriptionFeatures !== undefined) {
    return base;
  }

  await connectDB();
  const sub = (await Subscription.findOne({ userId: ctx.userId })
    .select({ plan: 1, status: 1, features: 1 })
    .lean()) as { plan?: string; status?: string; features?: string[] } | null;

  return {
    ...base,
    plan: base.plan ?? sub?.plan,
    subscriptionStatus: base.subscriptionStatus ?? sub?.status,
    subscriptionFeatures: sub?.features ?? [],
  };
}

/** Resuelve medición con datos de suscripción (promos en features). */
export async function resolveConversationMetering(
  input: ResolveInput,
  policies: MeteringPolicy[] = DEFAULT_METERING_POLICIES,
): Promise<MeteringDecision> {
  const ctx = await enrichContext(input);
  return resolveMetering(ctx, policies);
}
