/** Utilidades CSS para orbe tipo burbuja iridiscente (sin imágenes ni SVG filter). */

export function hashWidgetSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rgbHueFromHex(hex: string): number | null {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let hh = 0;
  if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) hh = ((b - r) / d + 2) / 6;
  else hh = ((r - g) / d + 4) / 6;
  return hh * 360;
}

function hsla(h: number, s: number, l: number, a: number): string {
  const hue = ((h % 360) + 360) % 360;
  return `hsla(${Math.round(hue)} ${Math.round(s)}% ${Math.round(l)}% / ${a})`;
}

const IRIDESCENT_BLEND =
  'screen, color-dodge, soft-light, hue, multiply' as const;

/**
 * Superficie tipo gel/holográfica: brillos fuertes + ondas cromáticas + sombreado de volumen.
 * `seed` desplaza posiciones/ángulos de forma estable por id.
 */
export function iridescentOrbBackgroundCss(hBase: number, seed: number): string {
  const u = (k: number) => ((seed >>> k) & 0x7fff) / 0x7fff;
  const from = Math.round((hBase * 1.38 + u(0) * 170) % 360);
  const x1 = 16 + u(3) * 28;
  const y1 = 10 + u(7) * 24;
  const x2 = 64 + u(11) * 26;
  const y2 = 62 + u(13) * 24;
  const x3 = 12 + u(17) * 24;
  const y3 = 64 + u(19) * 20;
  const swirlX = 52 + (u(21) - 0.5) * 10;
  const swirlY = 50 + (u(23) - 0.5) * 12;
  const c1 = hBase + 12;
  const c2 = hBase + 138;
  const c3 = c1;

  const conic = `conic-gradient(from ${from}deg at ${swirlX}% ${swirlY}%, ${hsla(c1, 95, 74, 0.82)} 0%, ${hsla(c2, 92, 66, 0.78)} 50%, ${hsla(c3, 95, 74, 0.82)} 100%)`;
  const swirl = `radial-gradient(130% 92% at ${50 + (u(25) - 0.5) * 8}% ${58 + (u(27) - 0.5) * 10}%, rgba(255,255,255,0) 28%, rgba(255,255,255,0.2) 44%, rgba(255,255,255,0.02) 59%, rgba(0,0,0,0.16) 78%, rgba(0,0,0,0.02) 100%)`;

  return [
    `radial-gradient(ellipse 108% 86% at ${x1}% ${y1}%, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.34) 18%, rgba(255,255,255,0.08) 34%, transparent 57%)`,
    `radial-gradient(circle at ${x2}% ${y2}%, ${hsla(c1, 92, 67, 0.24)} 0%, ${hsla(c1, 92, 67, 0.08)} 26%, transparent 52%)`,
    `radial-gradient(circle at ${x3}% ${y3}%, ${hsla(c2, 90, 64, 0.26)} 0%, ${hsla(c2, 90, 64, 0.08)} 24%, transparent 49%)`,
    `radial-gradient(circle at ${84 - u(21) * 18}% ${16 + u(25) * 20}%, ${hsla(c3, 92, 67, 0.2)} 0%, transparent 44%)`,
    swirl,
    conic,
    `linear-gradient(${Math.round(154 + u(5) * 24)}deg, rgba(4,6,20,0.48) 0%, rgba(4,6,20,0.16) 26%, transparent 62%)`,
  ].join(', ');
}

export function iridescentOrbBlendModes(): string {
  return IRIDESCENT_BLEND;
}

/** Cinco modos del orbe + `normal` para las dos capas del degradado base del FAB. */
export function fabOrbitBlendModes(): string {
  return `${IRIDESCENT_BLEND}, normal, normal`;
}

export function defaultHueFromHex(hex: string): number {
  return rgbHueFromHex(hex) ?? 248;
}

