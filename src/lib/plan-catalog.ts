/**
 * Fuente única de verdad — planes MatIAs (widget SaaS no-code).
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

export const PLAN_PRICES_USD: Record<PaidPlanId, number> = {
  solo: 5,
  basic: 14,
  plus: 24,
  starter: 39,
  growth: 99,
  business: 349,
};

export const PLAN_DISPLAY: Record<
  string,
  { label: string; priceLabel: string; priceUsd: number }
> = {
  free:       { label: 'Free',       priceLabel: '$0',       priceUsd: 0   },
  solo:       { label: 'Solo',       priceLabel: '$5/mes',   priceUsd: 5   },
  basic:      { label: 'Basic',      priceLabel: '$14/mes',  priceUsd: 14  },
  plus:       { label: 'Plus',       priceLabel: '$24/mes',  priceUsd: 24  },
  starter:    { label: 'Starter',    priceLabel: '$39/mes',  priceUsd: 39  },
  growth:     { label: 'Growth',     priceLabel: '$99/mes',  priceUsd: 99  },
  business:   { label: 'Business',   priceLabel: '$349/mes', priceUsd: 349 },
  enterprise: { label: 'Enterprise', priceLabel: 'Contacto', priceUsd: -1  },
};

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

/** Agentes principales por plan (límite realista para PME). */
export const PLAN_AGENT_LIMITS: Record<string, number> = {
  free:       1,
  solo:       1,
  basic:      3,
  plus:       5,
  starter:    10,
  growth:     25,
  business:   50,
  enterprise: 999,
};

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
export const CONVERSATION_PACKS = [
  { id: 'pack_s', label: 'Pack S', conversations: 1_000,  price: 12,  priceLabel: '$12'  },
  { id: 'pack_m', label: 'Pack M', conversations: 5_000,  price: 50,  priceLabel: '$50'  },
  { id: 'pack_l', label: 'Pack L', conversations: 15_000, price: 120, priceLabel: '$120' },
] as const;

export type PackId = (typeof CONVERSATION_PACKS)[number]['id'];

/** Solo suscriptores de pago pueden comprar packs (free no). */
export const PACK_ELIGIBLE_PLANS = new Set<string>(PAID_PLAN_IDS);

export function canPurchaseConversationPacks(plan: string, status: string): boolean {
  const effective = ['active', 'trialing'].includes(status) ? plan : 'free';
  return PACK_ELIGIBLE_PLANS.has(effective);
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
    '1 agente · 3 herramientas (Web Search, Webhook, Gmail)',
    'Widgets ilimitados',
    'Autoguiado: documentación y videos en YouTube',
    'Soporte por email (72 h, sin onboarding dedicado)',
  ],
  basic: [
    '1.500 conversaciones al mes (~50/día)',
    '3 agentes · 2 sub-agentes · 5 herramientas',
    'Gmail y Slack · widgets ilimitados',
    'Historial: 30 días',
    'Capacitación grupal incluida · soporte email (72 h)',
  ],
  plus: [
    '3.000 conversaciones al mes (~100/día)',
    '5 agentes · 5 sub-agentes · 8 herramientas',
    'RAG: 256 MB · 20 fuentes por agente',
    'Historial: 60 días · widgets ilimitados',
    'Capacitación grupal · soporte email (48 h)',
  ],
  starter: [
    '6.000 conversaciones al mes (~200/día)',
    '10 agentes · 10 sub-agentes · 15 herramientas',
    'RAG: 1 GB · 60 fuentes por agente',
    'Historial: 3 meses · widgets ilimitados',
    'Capacitación incluida · soporte email (48 h)',
  ],
  growth: [
    '16.000 conversaciones al mes (~530/día)',
    '25 agentes · 25 sub-agentes · integraciones avanzadas',
    'RAG: 10 GB · 300 fuentes · analítica avanzada',
    'Historial: 1 año · widgets ilimitados',
    'Modelos Pro disponibles · soporte chat (24 h)',
  ],
  business: [
    '45.000 conversaciones al mes (~1.500/día)',
    '50 agentes · 50 sub-agentes · MCP e integraciones completas',
    'RAG: 100 GB · 2.000 fuentes por agente',
    'Historial ilimitado · widgets ilimitados',
    'Todos los modelos · soporte dedicado · SLA 99,9 %',
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
    'Acuerdos de volumen personalizados',
    'White-label disponible',
    'Soporte dedicado 24/7',
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
