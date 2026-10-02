/**
 * Validación de `Widget.skin` (colores por zona y tipografía) al guardar y al servir la config.
 * Misma regla que scripts/widget/skin.js (lo aplica el widget); un test compara las dos.
 */

export const WIDGET_SKIN_COLOR_KEYS = [
  'headerBg', 'headerText', 'footerBg', 'inputBg', 'inputText', 'sendBg',
  'chatBg', 'userBubbleBg', 'userBubbleText', 'botBubbleBg', 'botBubbleText', 'fabBg',
] as const;

export const WIDGET_SKIN_FONTS = ['inherit', 'Inter', 'Poppins', 'Roboto', 'Montserrat', 'Lato', 'Open Sans', 'Nunito', 'system'] as const;

export type WidgetSkinColorKey = (typeof WIDGET_SKIN_COLOR_KEYS)[number];
export type WidgetSkin = Partial<Record<WidgetSkinColorKey, string>> & {
  fontFamily?: (typeof WIDGET_SKIN_FONTS)[number];
  fontScale?: 'sm' | 'md' | 'lg';
};

function hex(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return /^#[0-9a-f]{6}$/.test(s) ? s : '';
}

export function normalizeWidgetSkin(raw: unknown): WidgetSkin {
  const out: WidgetSkin = {};
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  for (const k of WIDGET_SKIN_COLOR_KEYS) {
    const h = hex(o[k]);
    if (h) out[k] = h;
  }
  if (typeof o.fontFamily === 'string' && (WIDGET_SKIN_FONTS as readonly string[]).includes(o.fontFamily)) {
    out.fontFamily = o.fontFamily as WidgetSkin['fontFamily'];
  }
  if (o.fontScale === 'sm' || o.fontScale === 'md' || o.fontScale === 'lg') out.fontScale = o.fontScale;
  return out;
}

/** Contraste WCAG entre dos colores hex (1–21). Para avisar en el editor si un texto se lee mal. */
export function contrastRatio(a: string, b: string): number {
  const lum = (h: string) => {
    const c = hex(h);
    if (!c) return NaN;
    const ch = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}
