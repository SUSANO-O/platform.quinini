/**
 * Economía unitaria por plan — costes de inferencia estimados vs ingreso.
 * Usa las mismas tasas que finance-aggregate.ts (panel admin).
 */

import {
  PAID_PLAN_IDS,
  PLAN_CONVERSATION_LIMITS,
  PLAN_PRICES_USD,
  PLAN_RAG_LIMITS,
  CONVERSATION_PACKS,
  PLAN_AGENT_LIMITS,
  PLAN_DISPLAY,
  PLAN_HISTORY_RETENTION_DAYS,
  planHasAgentWebhookFeature,
  planHasOutboundWebhookFeature,
  type PaidPlanId,
  type PlanId,
} from '@/lib/plan-catalog';
import { financeRateConfig } from '@/lib/finance-rates';

export type ModelTier = 'flash' | 'default' | 'premium';

/** Perfil de coste asumido por plan si el cliente usa el techo de cuota. */
export const PLAN_ASSUMED_MODEL_TIER: Record<PlanId, ModelTier> = {
  free:       'flash',
  solo:       'flash',
  basic:      'flash',
  plus:       'default',
  starter:    'default',
  growth:     'default',
  business:   'premium',
  enterprise: 'premium',
};

/** Tokens por mensaje (alineado con admin/model-stats). */
export const TOKENS_PER_MESSAGE: Record<ModelTier, { input: number; output: number }> = {
  flash:   { input: 350, output: 100 },
  default: { input: 550, output: 150 },
  premium: { input: 750, output: 200 },
};

/** Precios API Gemini (USD / 1M tokens) — referencia mayo 2026. */
export const GEMINI_API_USD_PER_1M = {
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-pro':   { input: 1.25, output: 10.00 },
} as const;

export function costPerMessageUsd(tier: ModelTier, ragEnabled: boolean): number {
  const cfg = financeRateConfig();
  const base =
    tier === 'flash' ? cfg.flashRate
    : tier === 'premium' ? cfg.premiumRate
    : cfg.defaultRate;
  return ragEnabled ? base * cfg.ragMultiplier : base;
}

export function geminiCostPerMessage(modelId: string, tier: ModelTier): number {
  const t = TOKENS_PER_MESSAGE[tier];
  const isPro = modelId.toLowerCase().includes('pro');
  const rates = isPro ? GEMINI_API_USD_PER_1M['gemini-2.5-pro'] : GEMINI_API_USD_PER_1M['gemini-2.5-flash'];
  return (t.input * rates.input + t.output * rates.output) / 1_000_000;
}

export type PlanEconomicsRow = {
  planId: PaidPlanId;
  priceUsd: number;
  conversations: number;
  revenuePerConv: number;
  assumedTier: ModelTier;
  ragEnabled: boolean;
  costPerConv: number;
  maxCogsUsd: number;
  maxGrossMarginUsd: number;
  maxGrossMarginPct: number;
  breakEvenUsagePct: number;
};

export function buildPlanEconomicsRows(): PlanEconomicsRow[] {
  return PAID_PLAN_IDS.map((planId) => {
    const priceUsd = PLAN_PRICES_USD[planId];
    const conversations = PLAN_CONVERSATION_LIMITS[planId];
    const tier = PLAN_ASSUMED_MODEL_TIER[planId];
    const ragEnabled = PLAN_RAG_LIMITS[planId] !== null;
    const costPerConv = costPerMessageUsd(tier, ragEnabled);
    const maxCogsUsd = Math.round(conversations * costPerConv * 100) / 100;
    const maxGrossMarginUsd = Math.round((priceUsd - maxCogsUsd) * 100) / 100;
    const maxGrossMarginPct = priceUsd > 0
      ? Math.round((maxGrossMarginUsd / priceUsd) * 1000) / 10
      : 0;
    const breakEvenUsagePct = priceUsd > 0
      ? Math.min(100, Math.round((priceUsd / (conversations * costPerConv)) * 1000) / 10)
      : 0;

    return {
      planId,
      priceUsd,
      conversations,
      revenuePerConv: Math.round((priceUsd / conversations) * 10000) / 10000,
      assumedTier: tier,
      ragEnabled,
      costPerConv,
      maxCogsUsd,
      maxGrossMarginUsd,
      maxGrossMarginPct,
      breakEvenUsagePct,
    };
  });
}

/** Filas para tabla comparativa pública (landing / pricing). */
export type PlanComparisonRow = {
  id: PlanId;
  label: string;
  priceLabel: string;
  conversations: string;
  agents: number;
  rag: string;
  history: string;
  support: string;
  agentWebhook: string;
  outboundWebhook: string;
  highlighted?: boolean;
};

export function formatConvLimit(n: number): string {
  if (n < 0) return 'Ilimitadas';
  if (n >= 1_000) return n.toLocaleString('es');
  return String(n);
}

export function formatHistoryDays(days: number): string {
  if (days < 0) return 'Ilimitado';
  if (days === 7) return '7 días';
  if (days === 30) return '30 días';
  if (days === 60) return '60 días';
  if (days === 90) return '3 meses';
  if (days === 365) return '1 año';
  return `${days} días`;
}

const SUPPORT_BY_PLAN: Record<PlanId, string> = {
  free:       'Comunidad',
  solo:       'Email 72 h',
  basic:      'Email 72 h',
  plus:       'Email 48 h',
  starter:    'Email 48 h',
  growth:     'Chat 24 h',
  business:   'Dedicado + SLA',
  enterprise: '24/7',
};

export function buildPlanComparisonRows(): PlanComparisonRow[] {
  const ids: PlanId[] = [
    'free', 'solo', 'basic', 'plus', 'starter', 'growth', 'business',
  ];
  return ids.map((id) => {
    const rag = PLAN_RAG_LIMITS[id];
    return {
      id,
      label: PLAN_DISPLAY[id]?.label ?? id,
      priceLabel: PLAN_DISPLAY[id]?.priceLabel ?? '—',
      conversations: formatConvLimit(PLAN_CONVERSATION_LIMITS[id]),
      agents: PLAN_AGENT_LIMITS[id],
      rag: rag ? `${rag.mb} MB · ${rag.sources} fuentes` : '—',
      history: formatHistoryDays(PLAN_HISTORY_RETENTION_DAYS[id]),
      support: SUPPORT_BY_PLAN[id],
      agentWebhook: planHasAgentWebhookFeature(id) ? 'Incluido' : '—',
      outboundWebhook: planHasOutboundWebhookFeature(id) ? 'Incluido' : '—',
      highlighted: id === 'growth',
    };
  });
}

/** Benchmark competidores (USD/mes, conversaciones incluidas) — referencia web 2026. */
export const MARKET_BENCHMARKS = [
  ...PAID_PLAN_IDS.map((id) => ({
    name: `MatIAs ${PLAN_DISPLAY[id].label}`,
    price: PLAN_PRICES_USD[id],
    conversations: PLAN_CONVERSATION_LIMITS[id],
    perConv: Math.round((PLAN_PRICES_USD[id] / PLAN_CONVERSATION_LIMITS[id]) * 10000) / 10000,
  })),
  { name: 'Chatbase Hobby', price: 32, conversations: 500, perConv: 0.064 },
  { name: 'Chatbase Standard', price: 120, conversations: 4_000, perConv: 0.03 },
  { name: 'Tidio Starter (Lyro)', price: 24, conversations: 100, perConv: 0.24 },
  { name: 'Tidio Growth', price: 49, conversations: 250, perConv: 0.196 },
] as const;

export function packEconomicsVsPlans() {
  return CONVERSATION_PACKS.map((pack) => {
    const perConv = pack.price / pack.conversations;
    const cheapestPlanPerConv = Math.min(
      ...PAID_PLAN_IDS.map((id) => PLAN_PRICES_USD[id] / PLAN_CONVERSATION_LIMITS[id]),
    );
    return {
      packId: pack.id,
      price: pack.price,
      conversations: pack.conversations,
      perConv,
      cheaperThanCheapestPlan: perConv < cheapestPlanPerConv,
      premiumVsStarter: perConv / (PLAN_PRICES_USD.starter / PLAN_CONVERSATION_LIMITS.starter),
    };
  });
}
