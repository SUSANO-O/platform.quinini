/** Datos de UI para planes (seguro en cliente; sin Stripe SDK). */

export const PLAN_ORDER = ['free', 'solo', 'basic', 'starter', 'growth', 'business', 'enterprise'] as const;

export type PlanId = (typeof PLAN_ORDER)[number];

export const PLAN_DISPLAY: Record<
  string,
  { label: string; priceLabel: string }
> = {
  free:       { label: 'Free',       priceLabel: '$0'       },
  solo:       { label: 'Solo',       priceLabel: '$3/mes'   },
  basic:      { label: 'Basic',      priceLabel: '$14/mes'  },
  starter:    { label: 'Starter',    priceLabel: '$39/mes'  },
  growth:     { label: 'Growth',     priceLabel: '$99/mes'  },
  business:   { label: 'Business',   priceLabel: '$349/mes' },
  enterprise: { label: 'Enterprise', priceLabel: 'Contacto' },
};

/** Sub-agentes por agente orquestador según el plan. */
export const PLAN_SUBAGENT_LIMITS: Record<string, number> = {
  free:       0,
  solo:       0,
  basic:      5,
  starter:    15,
  growth:     50,
  business:   150,
  enterprise: 999,
};

/** Packs de conversaciones disponibles para compra one-time. */
export const CONVERSATION_PACKS = [
  { id: 'pack_s', label: 'Pack S', conversations: 1_000,  price: 4,  priceLabel: '$4' },
  { id: 'pack_m', label: 'Pack M', conversations: 5_000,  price: 15, priceLabel: '$15' },
  { id: 'pack_l', label: 'Pack L', conversations: 15_000, price: 39, priceLabel: '$39' },
] as const;

export type PackId = typeof CONVERSATION_PACKS[number]['id'];

/** Límite mensual de conversaciones por plan (-1 = ilimitado). */
export const PLAN_CONVERSATION_LIMITS: Record<string, number> = {
  free:       50,
  solo:       300,
  basic:      1_500,
  starter:    6_000,
  growth:     30_000,
  business:   150_000,
  enterprise: -1,
};

/** Retención de historial de conversaciones en días (-1 = ilimitado). */
export const PLAN_HISTORY_RETENTION_DAYS: Record<string, number> = {
  free:       7,
  solo:       30,
  basic:      30,
  starter:    90,
  growth:     365,
  business:   -1,
  enterprise: -1,
};

/** Límite técnico de conocimiento RAG por agente (null = no aplica/no habilitado). */
export const PLAN_RAG_LIMITS: Record<string, { mb: number; sources: number } | null> = {
  free:       null,
  solo:       null,
  basic:      null,
  starter:    { mb: 1_024,   sources: 60   },
  growth:     { mb: 10_240,  sources: 300  },
  business:   { mb: 102_400, sources: 2000 },
  enterprise: { mb: 999_999, sources: 9999 },
};

export function planRank(plan: string): number {
  const i = PLAN_ORDER.indexOf(plan as PlanId);
  return i >= 0 ? i : 0;
}

/** Planes de pago ordenados para “mejorar plan” (excluye free si ya pagó). */
export const PAID_PLAN_IDS: Array<'solo' | 'basic' | 'starter' | 'growth' | 'business'> = ['solo', 'basic', 'starter', 'growth', 'business'];

/** Incluye cada plan de pago (texto para modales / UI). */
export const PLAN_FEATURE_BULLETS: Record<
  'solo' | 'basic' | 'starter' | 'growth' | 'business',
  string[]
> = {
  solo: [
    '300 conversaciones al mes (~10/día)',
    '1 agente · 3 herramientas · Web Search, Webhook, Gmail',
    'Widgets ilimitados (nombre único por widget)',
    'Videos de capacitación en YouTube',
    'Capacitación y acompañamiento incluido',
    'Soporte por email (42 h)',
  ],
  basic: [
    '1.500 conversaciones al mes (~50/día)',
    '5 agentes · 5 sub-agentes por agente · 5 herramientas',
    'Herramientas: Web Search, Webhook, Gmail, Slack, WhatsApp',
    'Widgets ilimitados (nombre único por widget)',
    'Historial de conversaciones: 30 días',
    'Capacitación y acompañamiento incluido',
    'Soporte por email (72 h)',
  ],
  starter: [
    '6.000 conversaciones al mes (~200/día)',
    '30 agentes · 15 sub-agentes por agente · 30 herramientas',
    'RAG: 1 GB · 60 fuentes por agente',
    'Widgets ilimitados (nombre único por widget)',
    'Historial de conversaciones: 3 meses',
    'Soporte por email (48 h)',
  ],
  growth: [
    '30.000 conversaciones al mes (~1.000/día)',
    '100 agentes · 50 sub-agentes por agente · 100 herramientas',
    'RAG: 10 GB · 300 fuentes por agente · analítica avanzada',
    'Widgets ilimitados (nombre único por widget)',
    'Historial de conversaciones: 1 año',
    'Soporte prioritario por chat (24 h)',
  ],
  business: [
    '150.000 conversaciones al mes (~5.000/día)',
    '500 agentes · 150 sub-agentes por agente · herramientas ilimitadas',
    'RAG: 100 GB · 2.000 fuentes por agente',
    'Widgets ilimitados (nombre único por widget)',
    'Historial de conversaciones: ilimitado',
    'Soporte dedicado · SLA 99,9 % · Onboarding incluido',
  ],
};

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
