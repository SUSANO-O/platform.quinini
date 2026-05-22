/**
 * Paleta corporativa BotIvA — regla 70-20-10
 * Inspirada en el logo (esfera teal/cian con destellos ámbar).
 *
 * 70%  Neutros (CSS: --background, --muted, --border, --foreground)
 * 20%  Marca dominante (teal)
 * 10%  Acentos secundarios (cian, ámbar) + premium
 */

export const BRAND = {
  primary: '#00838f',
  primaryDark: '#006064',
  primaryLight: '#18dce5',
  warm: '#ffb300',
  cool: '#006064',
} as const;

/** Reservado para plan Growth / badges «Popular» / tier premium */
export const PREMIUM = {
  accent: '#00838f',
  bg: 'rgba(var(--brand-primary-rgb),0.08)',
  border: 'rgba(var(--brand-primary-rgb),0.25)',
  gradient: 'linear-gradient(145deg,rgba(var(--brand-primary-rgb),0.06),rgba(var(--brand-primary-rgb),0.03))',
} as const;

/** Estados de UI — no usar colores de marca aquí */
export const STATE = {
  success: '#22c55e',
  successBg: 'rgba(34,197,94,0.1)',
  successBorder: 'rgba(34,197,94,0.2)',
  error: '#ef4444',
  errorBg: 'rgba(239,68,68,0.08)',
  errorBorder: 'rgba(239,68,68,0.2)',
  warning: '#f59e0b',
  warningBg: 'rgba(245,158,11,0.1)',
  warningBorder: 'rgba(245,158,11,0.25)',
  info: '#64748b',
  muted: '#94a3b8',
} as const;

/** Acento por plan — Growth usa premium; el resto usa trío de marca */
export const PLAN_ACCENTS: Record<string, string> = {
  solo: BRAND.primary,
  basic: BRAND.warm,
  plus: '#6366f1',
  starter: BRAND.primary,
  growth: PREMIUM.accent,
  business: '#7c3aed',
};

/** Trío de marca para métricas (máx. 3 acentos por bloque) */
export const METRIC = {
  primary: BRAND.primary,
  secondary: BRAND.warm,
  tertiary: BRAND.primaryDark,
  neutral: STATE.info,
} as const;

/** Alias cortos (compatibilidad con páginas existentes) */
export const R = BRAND.primary;
export const O = BRAND.warm;
export const B = BRAND.primaryDark;
export const Rd = BRAND.primaryDark;

export const BRAND_GRADIENT = BRAND.primary;
export const BRAND_GRADIENT_FULL = BRAND.primary;
