/**
 * Paleta corporativa — regla 70-20-10
 *
 * 70%  Neutros (CSS: --background, --muted, --border, --foreground)
 * 20%  Marca dominante (rojo)
 * 10%  Acentos secundarios (naranja, azul) + premium (cian)
 *
 * Usa BRAND / PREMIUM solo en CTAs, hero, badges de marca y pricing premium.
 * Usa STATE para éxito, error, advertencia e info funcional — nunca mezcles con marca.
 */

export const BRAND = {
  primary: '#e41414',
  primaryDark: '#bb1b14',
  primaryLight: '#f1513a',
  warm: '#f87600',
  cool: '#00acf8',
} as const;

/** Reservado para plan Growth / badges «Popular» / tier premium */
export const PREMIUM = {
  accent: '#00f8e5',
  bg: 'rgba(0,248,229,0.08)',
  border: 'rgba(0,248,229,0.25)',
  gradient: 'linear-gradient(145deg,rgba(0,248,229,0.06),rgba(0,172,248,0.06))',
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
  starter: BRAND.cool,
  growth: PREMIUM.accent,
  business: '#9333ea',
};

/** Trío de marca para métricas (máx. 3 acentos por bloque) */
export const METRIC = {
  primary: BRAND.primary,
  secondary: BRAND.warm,
  tertiary: BRAND.cool,
  neutral: STATE.info,
} as const;

/** Alias cortos (compatibilidad con páginas existentes) */
export const R = BRAND.primary;
export const O = BRAND.warm;
export const B = BRAND.cool;
export const Rd = BRAND.primaryDark;

export const BRAND_GRADIENT = `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.warm})`;
export const BRAND_GRADIENT_FULL = `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.warm}, ${BRAND.cool})`;
