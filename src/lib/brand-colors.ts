/**
 * Paleta Cognitive Nexus — BotIvA
 * Primary #006B7D · Tertiary #8B551E · Neutral #1A1C1E
 * (Sin amarillo #FFB800 — acento cálido = bronce tertiary)
 */

export const BRAND = {
  primary: '#006B7D',
  primaryDark: '#004A57',
  primaryLight: '#28A4B8',
  tertiary: '#8B551E',
  neutral: '#1A1C1E',
  cool: '#004A57',
  /** @deprecated Usar tertiary — ya no hay ámbar en UI */
  warm: '#8B551E',
} as const;

/** Reservado para plan Growth / badges destacados */
export const PREMIUM = {
  accent: BRAND.primary,
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
  warning: '#d97706',
  warningBg: 'rgba(217,119,6,0.1)',
  warningBorder: 'rgba(217,119,6,0.25)',
  info: '#64748b',
  muted: '#94a3b8',
} as const;

/** Acento por plan */
export const PLAN_ACCENTS: Record<string, string> = {
  solo: BRAND.primary,
  basic: BRAND.tertiary,
  team: BRAND.primaryLight,
  plus: '#6366f1',
  starter: BRAND.primary,
  growth: PREMIUM.accent,
  business: '#7c3aed',
};

/** Trío de marca para métricas */
export const METRIC = {
  primary: BRAND.primary,
  secondary: BRAND.tertiary,
  tertiary: BRAND.primaryDark,
  neutral: STATE.info,
} as const;

/** Alias cortos (compatibilidad) */
export const R = BRAND.primary;
export const O = BRAND.tertiary;
export const B = BRAND.primaryDark;
export const Rd = BRAND.tertiary;

export const BRAND_GRADIENT = BRAND.primary;
export const BRAND_GRADIENT_FULL = `linear-gradient(135deg, ${BRAND.primaryDark}, ${BRAND.primary}, ${BRAND.primaryLight})`;
