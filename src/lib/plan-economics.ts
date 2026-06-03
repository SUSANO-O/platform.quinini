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
  formatAgentLimit,
  PLAN_DISPLAY,
  PLAN_HISTORY_RETENTION_DAYS,
  planHasAgentWebhookFeature,
  planHasOutboundWebhookFeature,
  planHasApiAccessFeature,
  API_REST_COMING_SOON_LABEL,
  planHasEscalationTicketFeature,
  planHasCustomIntegrationFeature,
  formatConversationAnalyticsFeature,
  type PaidPlanId,
  type PlanId,
} from '@/lib/plan-catalog';
import { financeRateConfig, estimatedUsdPerMessageWithRag } from '@/lib/finance-rates';
import { estimatePlanInfraUsdMonth } from '@/lib/finance-infra';
import {
  GEMINI_API_USD_PER_1M,
  TOKENS_PER_MESSAGE,
  geminiCostPerMessage,
  type ModelTier,
} from '@/lib/llm-cost';

export type { ModelTier };
export { GEMINI_API_USD_PER_1M, TOKENS_PER_MESSAGE, geminiCostPerMessage };

/** Perfil de coste asumido por plan si el cliente usa el techo de cuota. */
export const PLAN_ASSUMED_MODEL_TIER: Record<PlanId, ModelTier> = {
  free:       'flash',
  solo:       'flash',
  team:       'default',
  plus:       'default',
  business:   'premium',
  enterprise: 'premium',
};

export function costPerMessageUsd(tier: ModelTier, ragEnabled: boolean): number {
  const cfg = financeRateConfig();
  const base =
    tier === 'flash' ? cfg.flashRate
    : tier === 'premium' ? cfg.premiumRate
    : cfg.defaultRate;
  return estimatedUsdPerMessageWithRag(base, ragEnabled);
}

export type PlanEconomicsRow = {
  planId: PaidPlanId;
  priceUsd: number;
  conversations: number;
  revenuePerConv: number;
  assumedTier: ModelTier;
  ragEnabled: boolean;
  costPerConv: number;
  infraUsdMonth: number;
  maxMessageCogsUsd: number;
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
    const maxMessageCogsUsd = Math.round(conversations * costPerConv * 100) / 100;
    const infra = estimatePlanInfraUsdMonth(planId, { conversations });
    const maxCogsUsd = Math.round((maxMessageCogsUsd + infra.totalUsd) * 100) / 100;
    const maxGrossMarginUsd = Math.round((priceUsd - maxCogsUsd) * 100) / 100;
    const maxGrossMarginPct = priceUsd > 0
      ? Math.round((maxGrossMarginUsd / priceUsd) * 1000) / 10
      : 0;
    const breakEvenUsagePct = priceUsd > 0 && costPerConv > 0
      ? Math.min(
          100,
          Math.round(
            ((priceUsd - infra.totalUsd) / (conversations * costPerConv)) * 1000,
          ) / 10,
        )
      : 0;

    return {
      planId,
      priceUsd,
      conversations,
      revenuePerConv: Math.round((priceUsd / conversations) * 10000) / 10000,
      assumedTier: tier,
      ragEnabled,
      costPerConv,
      infraUsdMonth: infra.totalUsd,
      maxMessageCogsUsd,
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
  agents: string;
  rag: string;
  history: string;
  support: string;
  agentWebhook: string;
  outboundWebhook: string;
  apiAccess: string;
  customIntegration: string;
  escalationTickets: string;
  conversationAnalytics: string;
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
  team:       'Email 48 h',
  plus:       'Email 90 h',
  business:   'Dedicado + SLA',
  enterprise: '24/7',
};

export function buildPlanComparisonRows(): PlanComparisonRow[] {
  const ids: PlanId[] = ['free', 'solo', 'team', 'plus', 'business'];
  return ids.map((id) => {
    const rag = PLAN_RAG_LIMITS[id];
    return {
      id,
      label: PLAN_DISPLAY[id]?.label ?? id,
      priceLabel: PLAN_DISPLAY[id]?.priceLabel ?? '—',
      conversations: formatConvLimit(PLAN_CONVERSATION_LIMITS[id]),
      agents: formatAgentLimit(PLAN_AGENT_LIMITS[id]),
      rag: rag ? `${rag.mb} MB · ${rag.sources} fuentes` : '—',
      history: formatHistoryDays(PLAN_HISTORY_RETENTION_DAYS[id]),
      support: SUPPORT_BY_PLAN[id],
      agentWebhook: planHasAgentWebhookFeature(id) ? 'Incluido' : '—',
      outboundWebhook: planHasOutboundWebhookFeature(id) ? 'Incluido' : '—',
      apiAccess: planHasApiAccessFeature(id) ? API_REST_COMING_SOON_LABEL : '—',
      customIntegration: planHasCustomIntegrationFeature(id) ? 'Incluido' : '—',
      escalationTickets: planHasEscalationTicketFeature(id) ? 'Incluido' : '—',
      conversationAnalytics: formatConversationAnalyticsFeature(id),
      highlighted: id === 'plus',
    };
  });
}

/** Unidad de facturación del competidor (referencia web mayo 2026). */
export type MarketBenchmarkUnit =
  | 'conversation'
  | 'message'
  | 'credit'
  | 'resolution'
  | 'session';

export type MarketBenchmarkSegment =
  | 'BotIvA'
  | 'rag-widget'
  | 'agent-builder'
  | 'live-chat'
  | 'helpdesk';

export type MarketBenchmark = {
  name: string;
  price: number;
  /** Cuota mensual incluida (1 si el precio es por unidad suelta). */
  conversations: number;
  perConv: number;
  unit: MarketBenchmarkUnit;
  segment: MarketBenchmarkSegment;
  note?: string;
};

function bench(
  name: string,
  price: number,
  quota: number,
  unit: MarketBenchmarkUnit,
  segment: MarketBenchmarkSegment,
  note?: string,
): MarketBenchmark {
  return {
    name,
    price,
    conversations: quota,
    perConv: Math.round((price / quota) * 10000) / 10000,
    unit,
    segment,
    note,
  };
}

const BotIvA_BENCHMARKS: MarketBenchmark[] = PAID_PLAN_IDS.map((id) =>
  bench(
    `BotIvA ${PLAN_DISPLAY[id].label}`,
    PLAN_PRICES_USD[id],
    PLAN_CONVERSATION_LIMITS[id],
    'conversation',
    'BotIvA',
  ),
);

/** Competidores widget RAG / chatbot sobre conocimiento. */
const RAG_WIDGET_BENCHMARKS: MarketBenchmark[] = [
  bench('Chatbase Hobby', 32, 500, 'credit', 'rag-widget', 'Créditos/mes; modelos premium consumen más'),
  bench('Chatbase Standard', 120, 4_000, 'credit', 'rag-widget'),
  bench('Chatbase Pro', 400, 15_000, 'credit', 'rag-widget'),
  bench('SiteGPT Starter', 39, 4_000, 'message', 'rag-widget', 'Mensaje = pregunta + respuesta'),
  bench('SiteGPT Growth', 79, 10_000, 'message', 'rag-widget'),
  bench('SiteGPT Scale', 259, 40_000, 'message', 'rag-widget'),
  bench('DocsBot Personal', 49, 5_000, 'message', 'rag-widget'),
  bench('DocsBot Standard', 149, 15_000, 'message', 'rag-widget'),
  bench('DocsBot Business', 499, 100_000, 'message', 'rag-widget'),
  bench('CustomGPT Standard', 99, 1_000, 'message', 'rag-widget', 'Queries/mes'),
  bench('CustomGPT Premium', 499, 5_000, 'message', 'rag-widget'),
];

/** Constructores de agentes / flujos. */
const AGENT_BUILDER_BENCHMARKS: MarketBenchmark[] = [
  bench('Botpress Plus', 189, 250, 'conversation', 'agent-builder', 'Incluye AI spend en conv'),
  bench('Botpress Team', 939, 1_500, 'conversation', 'agent-builder'),
  bench('Landbot Starter (AI)', 45, 100, 'conversation', 'agent-builder', 'Solo AI chats, no chats clásicos'),
  bench('Landbot Pro (AI)', 110, 300, 'conversation', 'agent-builder'),
];

/** Live chat + IA (SMB). */
const LIVE_CHAT_BENCHMARKS: MarketBenchmark[] = [
  bench('Lyro Core', 39, 50, 'conversation', 'live-chat', 'Standalone Lyro AI'),
  bench('Lyro ~500 conv', 79, 500, 'conversation', 'live-chat'),
  bench('Lyro ~1000 conv', 149, 1_000, 'conversation', 'live-chat'),
  bench('Crisp Essentials (Hugo)', 95, 450, 'conversation', 'live-chat', '~$25 créditos Hugo incl. en plan $95'),
];

/** Helpdesk — precio por resolución/sesión (no comparable 1:1 con conv widget). */
const HELPDESK_BENCHMARKS: MarketBenchmark[] = [
  bench('Intercom Fin', 0.99, 1, 'resolution', 'helpdesk', 'Por outcome resuelto + asientos'),
  bench('Zendesk AI Agent', 1.5, 1, 'resolution', 'helpdesk', 'Compromiso anual ~$1.50/res'),
  bench('Gorgias AI Agent', 0.9, 1, 'resolution', 'helpdesk', '+ ticket helpdesk'),
  bench('Freshworks Freddy', 0.49, 1, 'session', 'helpdesk', '$49/100 sesiones 24h'),
  bench('My AskAI Scale', 499, 2_000, 'conversation', 'helpdesk', 'Tickets/mes incluidos'),
];

/**
 * Benchmark completo — fuente única para exposición, auditoría y admin.
 * Precios públicos referencia mayo 2026.
 */
export const MARKET_BENCHMARKS: MarketBenchmark[] = [
  ...BotIvA_BENCHMARKS,
  ...RAG_WIDGET_BENCHMARKS,
  ...AGENT_BUILDER_BENCHMARKS,
  ...LIVE_CHAT_BENCHMARKS,
  ...HELPDESK_BENCHMARKS,
];

/** Solo unidades comparables con conv/mensaje/crédito (excluye $/resolución suelta). */
export function marketBenchmarksConversationLike(): MarketBenchmark[] {
  return MARKET_BENCHMARKS.filter((b) => b.unit !== 'resolution')
    .slice()
    .sort((a, b) => a.perConv - b.perConv);
}

export function marketBenchmarksBySegment(
  segment: MarketBenchmarkSegment,
): MarketBenchmark[] {
  return MARKET_BENCHMARKS.filter((b) => b.segment === segment);
}

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
      premiumVsPlus: perConv / (PLAN_PRICES_USD.plus / PLAN_CONVERSATION_LIMITS.plus),
    };
  });
}
