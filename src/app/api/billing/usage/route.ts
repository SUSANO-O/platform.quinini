/**
 * GET /api/billing/usage
 * Devuelve uso de conversaciones del mes (pools agentes + API), packs activos y límites del plan.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { checkConversationQuota } from '@/lib/quota';
import { connectDB } from '@/lib/db/connection';
import { ConversationPack, PlatformUsage, Subscription } from '@/lib/db/models';
import { getAgentLimits, PLATFORM_AGENT_FREE_REQUESTS_PER_USER_MONTH } from '@/lib/agent-plans';
import { getPlatformGiftCycleKey } from '@/lib/platform-agent-utils';
import {
  API_ACCESS_ADDON_CONVERSATIONS,
  API_ACCESS_ADDON_PRICE_USD,
  PLAN_AGENT_LIMITS,
  PLAN_DISPLAY,
  PLAN_PRICES_USD,
  canPurchaseApiAccessAddon,
  canUseApiAccess,
  formatAgentLimit,
  formatPlanPriceLabel,
  isApiOnlyPlan,
  isSellablePaidPlan,
} from '@/lib/plan-catalog';
import {
  buildDashboardPlanFeatures,
  countEnabledFeatures,
  type DashboardPlanFeature,
} from '@/lib/dashboard-plan-features';

function poolPayload(quota: Awaited<ReturnType<typeof checkConversationQuota>>) {
  const percentUsed =
    quota.limit === -1 ? 0 : Math.round((quota.used / Math.max(quota.limit, 1)) * 100);
  return {
    used: quota.used,
    baseLimit: quota.baseLimit,
    packLimit: quota.packLimit,
    limit: quota.limit,
    percentUsed,
    allowed: quota.allowed,
  };
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  try {
    await connectDB();
    const [agentQuota, apiQuota, packs, sub] = await Promise.all([
      checkConversationQuota(userId, 'agents'),
      checkConversationQuota(userId, 'api'),
      ConversationPack.find({
        userId, status: 'active', expiresAt: { $gt: new Date() },
      }).select({ packId: 1, conversations: 1, used: 1, expiresAt: 1 }).lean() as Promise<
        { packId: string; conversations: number; used: number; expiresAt: Date }[]
      >,
      Subscription.findOne({ userId })
        .select({ plan: 1, status: 1, features: 1 })
        .lean() as Promise<{ plan?: string; status?: string; features?: string[] } | null>,
    ]);

    const quota = agentQuota;
    const plan = sub?.plan ?? quota.plan;
    const status = sub?.status ?? 'free';
    const features = sub?.features ?? [];
    const effectivePlan = quota.plan;
    const agentLimit = PLAN_AGENT_LIMITS[effectivePlan] ?? PLAN_AGENT_LIMITS.free;
    const limits = getAgentLimits(effectivePlan);
    const hasApiAccess = canUseApiAccess(plan, status, features);
    const canPurchaseApiAddon = canPurchaseApiAccessAddon(plan, status, features);
    const planFeatures = buildDashboardPlanFeatures(plan, status, features);
    const planFeaturesEnabled = countEnabledFeatures(planFeatures);
    const planPriceLabel =
      effectivePlan === 'free'
        ? '$0'
        : isSellablePaidPlan(effectivePlan)
          ? formatPlanPriceLabel(PLAN_PRICES_USD[effectivePlan])
          : (PLAN_DISPLAY[effectivePlan]?.priceLabel ?? '');

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
      planLabel: PLAN_DISPLAY[quota.plan]?.label ?? quota.plan,
      subscriptionStatus: status,
      percentUsed,
      allowed: quota.allowed,
      platformCycleKey,
      platformFreeLimit,
      platformFreeUsed,
      platformFreeRemaining,
      pools: {
        agents: poolPayload(agentQuota),
        api: poolPayload(apiQuota),
      },
      hasApiAccess,
      canPurchaseApiAddon,
      isApiOnlyPlan: isApiOnlyPlan(effectivePlan),
      agentLimit,
      agentLimitLabel: formatAgentLimit(agentLimit),
      ragStorageMbPerAgent: limits.ragStorageMbPerAgent,
      apiAddon: {
        priceUsd: API_ACCESS_ADDON_PRICE_USD,
        conversations: API_ACCESS_ADDON_CONVERSATIONS,
      },
      planPriceLabel,
      planFeatures,
      planFeaturesEnabled,
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
