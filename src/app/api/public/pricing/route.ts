import { NextResponse } from 'next/server';
import {
  API_ACCESS_ADDON_CONVERSATIONS,
  API_ACCESS_ADDON_PRICE_USD,
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
      apiAccessAddon: {
        priceUsd: API_ACCESS_ADDON_PRICE_USD,
        priceLabel: formatPlanPriceLabel(API_ACCESS_ADDON_PRICE_USD),
        conversationsPerMonth: API_ACCESS_ADDON_CONVERSATIONS,
        note: 'Opcional en Team, Plus y Business — cupo API separado del widget.',
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
