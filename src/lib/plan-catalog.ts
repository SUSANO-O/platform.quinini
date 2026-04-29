/** Datos de UI para planes (seguro en cliente; sin Stripe SDK). */

export const PLAN_ORDER = ['free', 'starter', 'growth', 'business', 'enterprise'] as const;

export type PlanId = (typeof PLAN_ORDER)[number];

export const PLAN_DISPLAY: Record<
  string,
  { label: string; priceLabel: string; widgets: number }
> = {
  free: { label: 'Free', priceLabel: '$0', widgets: 1 },
  starter: { label: 'Starter', priceLabel: '$29/mes', widgets: 2 },
  growth: { label: 'Growth', priceLabel: '$79/mes', widgets: 5 },
  business: { label: 'Business', priceLabel: '$199/mes', widgets: 15 },
  enterprise: { label: 'Enterprise', priceLabel: 'Contacto', widgets: 999 },
};

/** Sub-agentes por agente orquestador según el plan. */
export const PLAN_SUBAGENT_LIMITS: Record<string, number> = {
  free:       0,
  starter:    1,
  growth:     3,
  business:   10,
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
  starter:    5_000,
  growth:     25_000,
  business:   100_000,
  enterprise: -1,
};

/** Límite técnico de conocimiento RAG por agente (null = no aplica/no habilitado). */
export const PLAN_RAG_LIMITS: Record<string, { mb: number; sources: number } | null> = {
  free: null,
  starter: null,
  growth: { mb: 100, sources: 50 },
  business: { mb: 1024, sources: 200 },
  enterprise: { mb: 10_240, sources: 1000 },
};

export function planRank(plan: string): number {
  const i = PLAN_ORDER.indexOf(plan as PlanId);
  return i >= 0 ? i : 0;
}

/** Planes de pago ordenados para “mejorar plan” (excluye free si ya pagó). */
export const PAID_PLAN_IDS: Array<'starter' | 'growth' | 'business'> = ['starter', 'growth', 'business'];

/** Incluye cada plan de pago (texto para modales / UI). */
export const PLAN_FEATURE_BULLETS: Record<
  'starter' | 'growth' | 'business',
  string[]
> = {
  starter: [
    '2 widgets activos en tu sitio',
    '5.000 conversaciones al mes (~167/día)',
    '1 agente personalizado · Chat AI + analítica básica (sin RAG)',
    'Soporte por email (48 h)',
  ],
  growth: [
    '5 widgets activos en tu sitio',
    '25.000 conversaciones al mes (~833/día)',
    'Agentes ilimitados + RAG + analítica avanzada',
    'RAG: hasta 100 MB o 50 fuentes por agente',
    'Soporte prioritario por chat (24 h)',
  ],
  business: [
    '15 widgets activos en tu sitio',
    '100.000 conversaciones al mes (~3.300/día)',
    'Agentes + RAG + integraciones MCP',
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
