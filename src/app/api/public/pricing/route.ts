import { NextResponse } from 'next/server';
import {
  API_ADDON_ELIGIBLE_MIN_PLAN,
  PAID_PLAN_IDS,
  PLAN_AGENT_CONVERSATION_LIMITS,
  PLAN_API_CONVERSATION_LIMITS,
  PLAN_DISPLAY,
  PLAN_FEATURE_BULLETS,
  PLAN_PRICES_USD,
  formatPlanPriceLabel,
  type PaidPlanId,
} from '@/lib/plan-catalog';

export const dynamic = 'force-dynamic';

/** Catálogo público JSON — misma fuente que /pricing (plan-catalog.ts). */
export async function GET() {
  const plans = PAID_PLAN_IDS.map((id: PaidPlanId) => ({
    id,
    name: PLAN_DISPLAY[id].label,
    priceUsd: PLAN_PRICES_USD[id],
    priceLabel: formatPlanPriceLabel(PLAN_PRICES_USD[id]),
    conversationsPerMonth:
      id === 'api_develop'
        ? PLAN_API_CONVERSATION_LIMITS.api_develop
        : PLAN_AGENT_CONVERSATION_LIMITS[id] ?? 0,
    features: PLAN_FEATURE_BULLETS[id],
  }));

  return NextResponse.json(
    {
      source: 'plan-catalog',
      currency: 'USD',
      billingPeriod: 'month',
      plans,
      enterprise: { id: 'enterprise', name: 'Enterprise', priceLabel: 'Contacto' },
      // API REST incluida desde Team (decisión 2026-08-26) — ya no es un add-on
      // de pago aparte, cada plan Team+ trae su propio cupo API dedicado.
      apiAccess: {
        includedFromPlan: API_ADDON_ELIGIBLE_MIN_PLAN,
        note: 'Incluida sin costo extra desde el plan Team en adelante, con cupo dedicado separado del widget.',
        conversationsPerMonthByPlan: {
          team: PLAN_API_CONVERSATION_LIMITS.team,
          plus: PLAN_API_CONVERSATION_LIMITS.plus,
          business: PLAN_API_CONVERSATION_LIMITS.business,
        },
      },
      pricingPageUrl: 'https://botiva.space/pricing',
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}
