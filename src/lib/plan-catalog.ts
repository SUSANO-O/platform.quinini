/**
 * Fuente única de verdad — planes BotIvA (widget SaaS no-code).
 * Todo pricing público, límites de producto y packs deben importarse desde aquí.
 *
 * Nota: agent-flow-gateway tiene planes API para developers (infra interna);
 * no usar esos precios en la landing ni el dashboard de widgets.
 */

export const PLAN_ORDER = [
  'free',
  'solo',
  'basic',
  'plus',
  'starter',
  'growth',
  'business',
  'enterprise',
] as const;

export type PlanId = (typeof PLAN_ORDER)[number];

export type PaidPlanId = 'solo' | 'basic' | 'plus' | 'starter' | 'growth' | 'business';

/** Planes de pago ordenados para upgrades/downgrades. */
export const PAID_PLAN_IDS: PaidPlanId[] = [
  'solo',
  'basic',
  'plus',
  'starter',
  'growth',
  'business',
];

/** Planes visibles en la landing (solo los más convenientes para conversión). */
export const LANDING_PLAN_IDS: PaidPlanId[] = ['plus', 'starter', 'growth'];

/** Grid principal en /pricing (incluye Basic y Business). */
export const PRICING_GRID_PLAN_IDS: PaidPlanId[] = [
  'basic',
  'plus',
  'starter',
  'growth',
  'business',
];

/** Precios revisados may 2026 — LLM + RAG + infra externa mínima (Atlas M10, Pinecone pago, storage). */
export const PLAN_PRICES_USD: Record<PaidPlanId, number> = {
  solo: 7,
  basic: 17,
  plus: 39,
  starter: 65,
  growth: 179,
  business: 749,
};

const PLAN_LABELS: Record<PlanId, string> = {
  free: 'Free',
  solo: 'Solo',
  basic: 'Basic',
  plus: 'Plus',
  starter: 'Starter',
  growth: 'Growth',
  business: 'Business',
  enterprise: 'Enterprise',
};

/** Etiqueta de precio mensual para UI ($7/mes, Contacto, etc.). */
export function formatPlanPriceLabel(usd: number): string {
  if (usd < 0) return 'Contacto';
  if (usd === 0) return '$0';
  return `$${usd}/mes`;
}

/** Etiqueta one-time para packs ($15, etc.). */
export function formatPackPriceLabel(usd: number): string {
  return `$${usd}`;
}

export const PLAN_DISPLAY: Record<
  string,
  { label: string; priceLabel: string; priceUsd: number }
> = Object.fromEntries(
  PLAN_ORDER.map((id) => {
    const label = PLAN_LABELS[id];
    const priceUsd =
      id in PLAN_PRICES_USD
        ? PLAN_PRICES_USD[id as PaidPlanId]
        : id === 'free'
          ? 0
          : -1;
    return [
      id,
      {
        label,
        priceUsd,
        priceLabel: formatPlanPriceLabel(priceUsd),
      },
    ];
  }),
);

/** Conversaciones incluidas por mes (-1 = ilimitado). Métrica principal de consumo. */
export const PLAN_CONVERSATION_LIMITS: Record<string, number> = {
  free:       50,
  solo:       300,
  basic:      1_500,
  plus:       3_000,
  starter:    6_000,
  growth:     16_000,
  business:   45_000,
  enterprise: -1,
};

/** Agentes principales por plan (límite realista para PME). `-1` = ilimitado. */
export const PLAN_AGENT_LIMITS: Record<string, number> = {
  free:       1,
  solo:       1,
  basic:      5,
  plus:       10,
  starter:    25,
  growth:     50,
  business:   -1,
  enterprise: 999,
};

/** `-1` = sin límite práctico en producto. */
export function formatAgentLimit(n: number): string {
  if (n < 0) return 'Ilimitados';
  return String(n);
}

export function isAgentLimitReached(used: number, limit: number): boolean {
  return limit >= 0 && used >= limit;
}

export const PLAN_SUBAGENT_LIMITS: Record<string, number> = {
  free:       0,
  solo:       0,
  basic:      2,
  plus:       5,
  starter:    10,
  growth:     25,
  business:   50,
  enterprise: 999,
};

export const PLAN_TOOLS_LIMITS: Record<string, number> = {
  free:       2,
  solo:       3,
  basic:      5,
  plus:       8,
  starter:    15,
  growth:     50,
  business:   999,
  enterprise: 999,
};

/** Solicitudes por minuto (rate limit técnico). */
export const PLAN_RATE_LIMITS_PER_MIN: Record<string, number> = {
  free:       10,
  solo:       20,
  basic:      30,
  plus:       40,
  starter:    60,
  growth:     120,
  business:   300,
  enterprise: 600,
};

/** Retención de historial de conversaciones en días (-1 = ilimitado). */
export const PLAN_HISTORY_RETENTION_DAYS: Record<string, number> = {
  free:       7,
  solo:       30,
  basic:      30,
  plus:       60,
  starter:    90,
  growth:     365,
  business:   -1,
  enterprise: -1,
};

/** Límite de conocimiento RAG por agente (null = no habilitado). */
export const PLAN_RAG_LIMITS: Record<string, { mb: number; sources: number } | null> = {
  free:       null,
  solo:       null,
  basic:      null,
  plus:       { mb: 256,     sources: 20   },
  starter:    { mb: 1_024,   sources: 60   },
  growth:     { mb: 10_240,  sources: 300  },
  business:   { mb: 102_400, sources: 2_000 },
  enterprise: { mb: 999_999, sources: 9_999 },
};

/**
 * Packs one-time — precio por conversación siempre por encima del plan equivalente
 * para incentivar upgrades (no canibalizar Starter/Growth).
 */
const PACK_SPECS = [
  { id: 'pack_s', label: 'Pack S', conversations: 1_000,  price: 15  },
  { id: 'pack_m', label: 'Pack M', conversations: 5_000,  price: 60  },
  { id: 'pack_l', label: 'Pack L', conversations: 15_000, price: 170 },
] as const;

export type PackId = (typeof PACK_SPECS)[number]['id'];

export const CONVERSATION_PACKS = PACK_SPECS.map((p) => ({
  ...p,
  priceLabel: formatPackPriceLabel(p.price),
}));

/** Solo suscriptores de pago pueden comprar packs (free no). */
export const PACK_ELIGIBLE_PLANS = new Set<string>(PAID_PLAN_IDS);

export function canPurchaseConversationPacks(plan: string, status: string): boolean {
  const effective = ['active', 'trialing'].includes(status) ? plan : 'free';
  return PACK_ELIGIBLE_PLANS.has(effective);
}

/** Plan mínimo para herramienta Webhook en el agente (llamadas salientes del chat). */
export const AGENT_WEBHOOK_MIN_PLAN: PlanId = 'solo';

/** Plan mínimo para webhook SaaS saliente (eventos firmados a tu backend). */
export const OUTBOUND_SAAS_WEBHOOK_MIN_PLAN: PlanId = 'starter';

/** Plan mínimo para acceso API REST (widgets, agentes, export). */
export const API_ACCESS_MIN_PLAN: PlanId = 'starter';

/** Plan mínimo para analytics de conversaciones (dashboard widget). */
export const CONVERSATION_ANALYTICS_MIN_PLAN: PlanId = 'plus';

/** Plan mínimo para analytics avanzado (export, histórico extendido). */
export const CONVERSATION_ANALYTICS_ADVANCED_MIN_PLAN: PlanId = 'growth';

/** Plan mínimo para creación de tickets al escalar (handoff + integraciones). */
export const ESCALATION_TICKET_MIN_PLAN: PlanId = 'growth';

/** Plan mínimo para integraciones custom (MCP completo, a medida). */
export const CUSTOM_INTEGRATION_MIN_PLAN: PlanId = 'business';

const PAID_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

/** Plan efectivo para límites de producto (trialing/active/past_due conservan plan). */
export function effectiveProductPlan(plan: string, status: string): string {
  return PAID_SUBSCRIPTION_STATUSES.has(status) ? plan : 'free';
}

export function canUseAgentWebhookTool(plan: string): boolean {
  return planRank(plan) >= planRank(AGENT_WEBHOOK_MIN_PLAN);
}

export function canUseOutboundSaasWebhook(plan: string, status: string): boolean {
  const effective = effectiveProductPlan(plan, status);
  return planRank(effective) >= planRank(OUTBOUND_SAAS_WEBHOOK_MIN_PLAN);
}

export function planHasAgentWebhookFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(AGENT_WEBHOOK_MIN_PLAN);
}

export function planHasOutboundWebhookFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(OUTBOUND_SAAS_WEBHOOK_MIN_PLAN);
}

export function planHasApiAccessFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(API_ACCESS_MIN_PLAN);
}

/** Etiqueta para tabla comparativa: — | Básico | Avanzado | Completo */
export function formatConversationAnalyticsFeature(planId: PlanId): string {
  if (planRank(planId) >= planRank('business')) return 'Completo';
  if (planRank(planId) >= planRank(CONVERSATION_ANALYTICS_ADVANCED_MIN_PLAN)) return 'Avanzado';
  if (planRank(planId) >= planRank(CONVERSATION_ANALYTICS_MIN_PLAN)) return 'Básico';
  return '—';
}

export function planHasEscalationTicketFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(ESCALATION_TICKET_MIN_PLAN);
}

export function planHasCustomIntegrationFeature(planId: PlanId): boolean {
  return planRank(planId) >= planRank(CUSTOM_INTEGRATION_MIN_PLAN);
}

export function outboundWebhookUpgradeLabel(): string {
  return PLAN_DISPLAY[OUTBOUND_SAAS_WEBHOOK_MIN_PLAN]?.label ?? 'Starter';
}

export function planRank(plan: string): number {
  const i = PLAN_ORDER.indexOf(plan as PlanId);
  return i >= 0 ? i : 0;
}

export function planChangeDirection(
  from: string,
  to: string,
): 'upgrade' | 'downgrade' | 'same' {
  const a = planRank(from);
  const b = planRank(to);
  if (b > a) return 'upgrade';
  if (b < a) return 'downgrade';
  return 'same';
}

/** Bullets para modales de cambio de plan y checkout. */
export const PLAN_FEATURE_BULLETS: Record<PaidPlanId, string[]> = {
  solo: [
    '300 conversaciones al mes (~10/día)',
    '1 agente · Webhook del agente · Web Search, Gmail',
    'Widgets ilimitados',
    'Autoguiado: documentación y videos en YouTube',
    'Soporte por email (72 h, sin onboarding dedicado)',
  ],
  basic: [
    '1.500 conversaciones al mes (~50/día)',
    '5 agentes · 2 sub-agentes · Webhook incluido',
    'Gmail y Slack · widgets ilimitados',
    'Historial: 30 días',
    'Capacitación grupal incluida · soporte email (72 h)',
  ],
  plus: [
    '3.000 conversaciones al mes (~100/día)',
    '10 agentes · 5 sub-agentes · Webhook incluido',
    'RAG: 256 MB · 20 fuentes · búsqueda vectorial Pinecone',
    'Analytics de conversaciones (básico) · historial 60 días',
    'Capacitación grupal · soporte email (48 h)',
  ],
  starter: [
    '6.000 conversaciones al mes (~200/día)',
    '25 agentes · 10 sub-agentes · Webhook del agente',
    'Acceso API REST · webhook saliente (HMAC) · HubSpot, Notion',
    'RAG: 1 GB · 60 fuentes · Pinecone · analytics básico',
    'Capacitación incluida · soporte email (48 h)',
  ],
  growth: [
    '16.000 conversaciones al mes (~530/día)',
    '50 agentes · API REST · webhook agente + saliente',
    'RAG: 10 GB · 300 fuentes · Pinecone incluido',
    'Creación de tickets al escalar · analytics avanzado',
    'Historial: 1 año · modelos Pro · soporte chat (24 h)',
  ],
  business: [
    '45.000 conversaciones al mes (~1.500/día)',
    'Agentes ilimitados · integraciones custom · MCP completo',
    'API REST · webhooks · RAG: 100 GB · Pinecone dedicado',
    'Tickets al escalar · analytics completo (multi-agente)',
    'Historial ilimitado · todos los modelos · SLA 99,9 %',
  ],
};

/** Features cortas para tarjetas de pricing (español). */
export const PLAN_PRICING_FEATURES: Record<PlanId, string[]> = {
  free: [
    '50 conversaciones al mes',
    '1 agente · 2 herramientas',
    '1 widget · historial 7 días',
    'Comunidad y documentación',
  ],
  solo: PLAN_FEATURE_BULLETS.solo,
  basic: PLAN_FEATURE_BULLETS.basic,
  plus: PLAN_FEATURE_BULLETS.plus,
  starter: PLAN_FEATURE_BULLETS.starter,
  growth: PLAN_FEATURE_BULLETS.growth,
  business: PLAN_FEATURE_BULLETS.business,
  enterprise: [
    'Conversaciones sin límite',
    'API REST · integraciones custom · analytics completo',
    'Tickets al escalar · acuerdos de volumen personalizados',
    'White-label disponible · soporte dedicado 24/7',
    'SLA empresarial personalizado',
  ],
};

export type PlanInfo = {
  id: PlanId;
  name: string;
  price: string;
  priceNote?: string;
  rateLimit: number;
  monthlyRequests: number;
  features: string[];
  highlighted?: boolean;
};

function fmtPrice(usd: number): string {
  return usd <= 0 ? '$0' : `$${usd}`;
}

/** Lista completa para tablas comparativas (/pricing). */
export function buildAllPricingPlans(): PlanInfo[] {
  const paidHighlighted: PaidPlanId = 'growth';
  const entries: PlanInfo[] = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      rateLimit: PLAN_RATE_LIMITS_PER_MIN.free,
      monthlyRequests: PLAN_CONVERSATION_LIMITS.free,
      features: PLAN_PRICING_FEATURES.free,
    },
    ...PAID_PLAN_IDS.map((id) => ({
      id,
      name: PLAN_DISPLAY[id].label,
      price: fmtPrice(PLAN_PRICES_USD[id]),
      priceNote: '/mes',
      rateLimit: PLAN_RATE_LIMITS_PER_MIN[id],
      monthlyRequests: PLAN_CONVERSATION_LIMITS[id],
      features: PLAN_PRICING_FEATURES[id],
      highlighted: id === paidHighlighted,
    })),
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Contacto',
      rateLimit: PLAN_RATE_LIMITS_PER_MIN.enterprise,
      monthlyRequests: PLAN_CONVERSATION_LIMITS.enterprise,
      features: PLAN_PRICING_FEATURES.enterprise,
    },
  ];
  return entries;
}

/** Planes de pago para el grid principal de /pricing. */
export function planEmailLabel(planId: string): string {
  const d = PLAN_DISPLAY[planId];
  if (!d) return planId;
  if (planId === 'enterprise') return 'Enterprise';
  return d.priceUsd > 0 ? `${d.label} (${d.priceLabel})` : d.label;
}

/** Planes de pago para el grid principal de /pricing. */
export function buildPricingGridPlans(): PlanInfo[] {
  return buildAllPricingPlans().filter((p) =>
    PRICING_GRID_PLAN_IDS.includes(p.id as PaidPlanId),
  );
}
