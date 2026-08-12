/** Nombre comercial visible en UI, emails y widget embebido. */
export const BRAND_NAME = 'BotIvA';

export const BRAND_ASSISTANT_NAME = 'BotIvA Assistant';

export const BRAND_ASSISTANT_NAME_ES = 'Asistente BotIvA';

/** Cache-bust del logo de marca (UI, favicon, PWA). */
export const BRAND_ICON_VERSION = 'filoia1';

/** Logo BotIvA — PNG (navbar, login, dashboard, emails). */
export const BRAND_LOGO_SRC = `/assets/marketing/botiva-logo.png?v=${BRAND_ICON_VERSION}`;
export const BRAND_LOGO_PNG_SRC = BRAND_LOGO_SRC;
export const BRAND_LOGO_PNG_2X_SRC = `/assets/marketing/botiva-logo@2x.png?v=${BRAND_ICON_VERSION}`;
export const BRAND_FAVICON_SRC = `/assets/marketing/botiva-logo-32.png?v=${BRAND_ICON_VERSION}`;

/** Orbe 3D cian — solo FAB / avatar de widgets de atención (assist). */
export const ASSIST_WIDGET_ORB_VERSION = 'orb-teal2';
export const ASSIST_WIDGET_ORB_SRC = `/assets/marketing/botiva-orb.png?v=${ASSIST_WIDGET_ORB_VERSION}`;

/** Texto legible en panel. */
export const BRAND_TEXT_COLOR = '#000000';

/** Botón / badge secundario neutro (sin acentos cian). */
export const UI_SURFACE_SECONDARY = {
  background: 'var(--muted)',
  border: 'none',
  boxShadow: 'var(--shadow-surface-sm)',
  color: 'var(--foreground)',
} as const satisfies Record<string, string>;
