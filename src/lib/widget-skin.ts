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
export const WIDGET_SKIN_RANGES = { chatWidth: [320, 520], chatHeight: [420, 760], fabSize: [48, 80], edgeOffset: [8, 48] } as const;
export const WIDGET_SKIN_HIDE_KEYS = ['hideAvatar', 'hideOnlineDot', 'hideTimestamps'] as const;

export type WidgetSkin = Partial<Record<WidgetSkinColorKey, string>> &
  Partial<Record<keyof typeof WIDGET_SKIN_RANGES, number>> &
  Partial<Record<(typeof WIDGET_SKIN_HIDE_KEYS)[number], true>> & {
    fontFamily?: (typeof WIDGET_SKIN_FONTS)[number];
    fontScale?: 'sm' | 'md' | 'lg';
    /** Texto propio del pie (≤ 120) y enlace https opcional. */
    footerNote?: string;
    footerNoteUrl?: string;
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
  for (const [k, [min, max]] of Object.entries(WIDGET_SKIN_RANGES) as [keyof typeof WIDGET_SKIN_RANGES, readonly [number, number]][]) {
    if (o[k] == null || o[k] === '') continue;
    const n = Math.round(Number(o[k]));
    if (Number.isFinite(n)) out[k] = Math.min(max, Math.max(min, n));
  }
  for (const k of WIDGET_SKIN_HIDE_KEYS) if (o[k] === true) out[k] = true;
  if (typeof o.footerNote === 'string') {
    const note = o.footerNote.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (note) out.footerNote = note;
  }
  if (out.footerNote && typeof o.footerNoteUrl === 'string' && /^https:\/\/[^\s"'<>]{3,300}$/.test(o.footerNoteUrl.trim())) {
    out.footerNoteUrl = o.footerNoteUrl.trim();
  }
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

// ── Paleta de marca y plantillas (estudio del widget) ─────────────────────────

function toRgb(h: string): [number, number, number] {
  const c = hex(h) || '#000000';
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
}
function toHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
/** Mezcla dos colores: t = 0 → a, t = 1 → b. */
function mix(a: string, b: string, t: number): string {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** Texto legible sobre un fondo: blanco o casi negro, el de más contraste. */
export function readableOn(bg: string): '#ffffff' | '#111111' {
  return contrastRatio('#ffffff', bg) >= contrastRatio('#111111', bg) ? '#ffffff' : '#111111';
}

/**
 * Fondo de marca con texto legible: si ni blanco ni negro llegan a contraste 4,5 sobre él (colores
 * de luminosidad media, p. ej. #e63312), se oscurece lo mínimo necesario. Para fondos CON texto.
 */
export function legibleBg(bg: string): string {
  let c = hex(bg) || '#006b7d';
  for (let i = 0; i < 20 && contrastRatio(readableOn(c), c) < 4.5; i++) c = mix(c, '#000000', 0.06);
  return c;
}

/** Tonos de la marca (3 claros, la marca, 3 oscuros) + neutros para el selector de color. */
export function brandPalette(brand: string): { brand: string[]; neutral: string[] } {
  const b = hex(brand) || '#006b7d';
  return {
    brand: [mix(b, '#ffffff', 0.88), mix(b, '#ffffff', 0.6), mix(b, '#ffffff', 0.3), b, mix(b, '#000000', 0.2), mix(b, '#000000', 0.4), mix(b, '#000000', 0.6)],
    neutral: ['#ffffff', '#f7f8fa', '#eef0f4', '#d5d9e0', '#6b7280', '#2b2f38', '#111318'],
  };
}

export type SkinTemplate = { id: string; name: string; description: string; skin: WidgetSkin };

/** Plantillas de un clic a partir del color de marca. Todos los textos cumplen contraste AA. */
export function skinTemplates(brand: string): SkinTemplate[] {
  const b = hex(brand) || '#006b7d';
  const bt = legibleBg(b); // marca con texto encima (cabecera, burbuja del usuario)
  const onB = readableOn(bt);
  const tint = mix(b, '#ffffff', 0.92);
  const deep = legibleBg(mix(b, '#000000', 0.55));
  return [
    {
      id: 'minimal',
      name: 'Minimal',
      description: 'Blanco, limpio; la marca solo en los acentos',
      skin: { headerBg: '#ffffff', headerText: '#111318', chatBg: '#ffffff', footerBg: '#ffffff', botBubbleBg: '#f3f4f6', botBubbleText: '#111318', userBubbleBg: bt, userBubbleText: onB, sendBg: b, fabBg: b, fontFamily: 'Inter' },
    },
    {
      id: 'corporativo',
      name: 'Corporativo',
      description: 'Cabecera de marca, sobrio y profesional',
      skin: { headerBg: bt, headerText: onB, chatBg: '#f7f8fa', footerBg: '#ffffff', botBubbleBg: '#ffffff', botBubbleText: '#1f2937', userBubbleBg: bt, userBubbleText: onB, sendBg: b, fabBg: b, fontFamily: 'Roboto' },
    },
    {
      id: 'oscuro',
      name: 'Noche',
      description: 'Oscuro elegante con la marca brillando',
      skin: { headerBg: '#111318', headerText: '#f3f4f6', chatBg: '#16181f', footerBg: '#111318', inputBg: '#1f222b', inputText: '#f3f4f6', botBubbleBg: '#23262f', botBubbleText: '#eef0f5', userBubbleBg: bt, userBubbleText: onB, sendBg: b, fabBg: b, fontFamily: 'Poppins' },
    },
    {
      id: 'vibrante',
      name: 'Vibrante',
      description: 'Marca intensa y fondo teñido, con personalidad',
      skin: { headerBg: deep, headerText: readableOn(deep), chatBg: tint, footerBg: tint, botBubbleBg: '#ffffff', botBubbleText: '#111318', userBubbleBg: bt, userBubbleText: onB, sendBg: b, fabBg: deep, fontFamily: 'Montserrat' },
    },
  ];
}
