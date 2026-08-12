/** Nombre comercial visible en UI, emails y widget embebido. */
export const BRAND_NAME = 'BotIvA';

export const BRAND_ASSISTANT_NAME = 'BotIvA Assistant';

export const BRAND_ASSISTANT_NAME_ES = 'Asistente BotIvA';

/** Orbe BotIvA (public/). */
export const BRAND_LOGO_SRC = '/assets/marketing/botiva-orb.png';

/** Texto legible en panel. */
export const BRAND_TEXT_COLOR = '#000000';

/** Botón / badge secundario neutro (sin acentos cian). */
export const UI_SURFACE_SECONDARY = {
  background: 'var(--muted)',
  border: 'none',
  boxShadow: 'var(--shadow-surface-sm)',
  color: 'var(--foreground)',
} as const satisfies Record<string, string>;
