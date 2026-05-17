/** Datos de UI para planes (seguro en cliente; sin Stripe SDK). */

export const PLAN_ORDER = ['free', 'basic', 'starter', 'growth', 'business', 'enterprise'] as const;

export type PlanId = (typeof PLAN_ORDER)[number];

export const PLAN_DISPLAY: Record<
  string,
  { label: string; priceLabel: string; widgets: number }
> = {
  free:       { label: 'Free',       priceLabel: '$0',        widgets: 1    },
  basic:      { label: 'Basic',      priceLabel: '$14/mes',   widgets: 10   },
  starter:    { label: 'Starter',    priceLabel: '$39/mes',   widgets: 300  },
  growth:     { label: 'Growth',     priceLabel: '$99/mes',   widgets: 1000 },
  business:   { label: 'Business',   priceLabel: '$349/mes',  widgets: 3000 },
  enterprise: { label: 'Enterprise', priceLabel: 'Contacto',  widgets: 9999 },
};

/** Sub-agentes por agente orquestador según el plan. */
export const PLAN_SUBAGENT_LIMITS: Record<string, number> = {
  free:       0,
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
  basic:      1_500,
  starter:    6_000,
  growth:     30_000,
  business:   150_000,
  enterprise: -1,
};

/** Retención de historial de conversaciones en días (-1 = ilimitado). */
export const PLAN_HISTORY_RETENTION_DAYS: Record<string, number> = {
  free:       7,
  basic:      30,
  starter:    90,
  growth:     365,
  business:   -1,
  enterprise: -1,
};

/** Límite técnico de conocimiento RAG por agente (null = no aplica/no habilitado). */
export const PLAN_RAG_LIMITS: Record<string, { mb: number; sources: number } | null> = {
  free:       null,
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
export const PAID_PLAN_IDS: Array<'basic' | 'starter' | 'growth' | 'business'> = ['basic', 'starter', 'growth', 'business'];

/** Incluye cada plan de pago (texto para modales / UI). */
export const PLAN_FEATURE_BULLETS: Record<
  'basic' | 'starter' | 'growth' | 'business',
  string[]
> = {
  basic: [
    '10 widgets activos en tu sitio',
    '1.500 conversaciones al mes (~50/día)',
    '5 agentes · 5 sub-agentes por agente · 3 herramientas',
    'Herramientas: Web Search, Webhook, Gmail',
    'Historial de conversaciones: 30 días',
    'Capacitación y acompañamiento incluido',
    'Soporte por email (72 h)',
  ],
  starter: [
    '300 widgets activos en tu sitio',
    '6.000 conversaciones al mes (~200/día)',
    '30 agentes · 15 sub-agentes por agente · 5 herramientas',
    'RAG: 1 GB · 60 fuentes por agente',
    'Historial de conversaciones: 3 meses',
    'Soporte por email (48 h)',
  ],
  growth: [
    '1.000 widgets activos en tu sitio',
    '30.000 conversaciones al mes (~1.000/día)',
    '100 agentes · 50 sub-agentes por agente · 10 herramientas',
    'RAG: 10 GB · 300 fuentes por agente · analítica avanzada',
    'Historial de conversaciones: 1 año',
    'Soporte prioritario por chat (24 h)',
  ],
  business: [
    '3.000 widgets activos en tu sitio',
    '150.000 conversaciones al mes (~5.000/día)',
    '300 agentes · 150 sub-agentes por agente · herramientas ilimitadas',
    'RAG: 100 GB · 2.000 fuentes por agente',
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
