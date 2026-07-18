import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { Subscription } from '@/lib/db/models';
import { canUseConversationFlows, conversationFlowsUpgradeLabel } from '@/lib/plan-catalog';

export type FlowAccessContext = {
  userId: string;
  plan: string;
  status: string;
  features: string[] | null;
  hasAccess: boolean;
};

export function flowAccessDeniedMessage(): string {
  return `Los flujos conversacionales requieren plan ${conversationFlowsUpgradeLabel()} o superior.`;
}

export async function resolveFlowAccessFromRequest(
  req: NextRequest,
): Promise<FlowAccessContext | null> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;

  const userId = verifySessionToken(token);
  if (!userId) return null;

  await connectDB();
  const sub = (await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1, features: 1 })
    .lean()) as {
    plan?: string;
    status?: string;
    features?: string[];
  } | null;

  const plan = sub?.plan ?? 'free';
  const status = sub?.status ?? 'free';
  const features = sub?.features ?? null;
  const hasAccess = canUseConversationFlows(plan, status, features);

  return { userId, plan, status, features, hasAccess };
}

export async function resolveFlowAccessForUser(userId: string): Promise<FlowAccessContext> {
  await connectDB();
  const sub = (await Subscription.findOne({ userId })
    .select({ plan: 1, status: 1, features: 1 })
    .lean()) as {
    plan?: string;
    status?: string;
    features?: string[];
  } | null;

  const plan = sub?.plan ?? 'free';
  const status = sub?.status ?? 'free';
  const features = sub?.features ?? null;
  const hasAccess = canUseConversationFlows(plan, status, features);

  return { userId, plan, status, features, hasAccess };
}
