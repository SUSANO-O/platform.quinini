/** Datos de UI para planes (seguro en cliente; sin Stripe SDK). */

export const PLAN_ORDER = ['free', 'starter', 'growth', 'business', 'enterprise'] as const;

export type PlanId = (typeof PLAN_ORDER)[number];

export const PLAN_DISPLAY: Record<
  string,
  { label: string; priceLabel: string; widgets: number }
> = {
  free: { label: 'Free', priceLabel: '$0', widgets: 1 },
  starter: { label: 'Starter', priceLabel: '$19/mes', widgets: 3 },
  growth: { label: 'Growth', priceLabel: '$49/mes', widgets: 6 },
  business: { label: 'Business', priceLabel: '$129/mes', widgets: 12 },
  enterprise: { label: 'Enterprise', priceLabel: 'Contacto', widgets: 999 },
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
    'Hasta 3 widgets embebidos',
    'Unas 50.000 solicitudes al mes',
    'Chat SDK y analíticas básicas',
    'Ideal para validar en producción',
  ],
  growth: [
    'Hasta 6 widgets',
    'Unas 200.000 solicitudes al mes',
    'Chat SDK, RAG y analíticas avanzadas',
    'Soporte prioritario',
  ],
  business: [
    'Hasta 12 widgets',
    'Solicitudes ilimitadas en el plan',
    'Todas las funciones y agentes personalizados',
    'Soporte dedicado y SLA 99,9%',
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
