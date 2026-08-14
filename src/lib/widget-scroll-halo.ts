/** Halo de scroll (fade superior/inferior sobre mensajes). */
import type { WidgetConfig } from '@/lib/widget-builder/types';

export const SCROLL_HALO_COLOR_MODES = ['brand', 'custom'] as const;
export type ScrollHaloColorMode = (typeof SCROLL_HALO_COLOR_MODES)[number];

export type ScrollHaloConfig = {
  scrollHaloEnabled: boolean;
  scrollHaloColorMode: ScrollHaloColorMode;
  /** HEX cuando scrollHaloColorMode === 'custom'. */
  scrollHaloColor: string;
  /** Altura del fade (px) — más bajo = más compacto. */
  scrollHaloHeight: number;
  /** Fuerza del fade (0–100). */
  scrollHaloOpacity: number;
  /** Suavidad / difuminado del borde (px). */
  scrollHaloBlur: number;
  scrollHaloTop: boolean;
  scrollHaloBottom: boolean;
};

export const DEFAULT_SCROLL_HALO: ScrollHaloConfig = {
  scrollHaloEnabled: true,
  scrollHaloColorMode: 'brand',
  scrollHaloColor: '',
  scrollHaloHeight: 28,
  scrollHaloOpacity: 55,
  scrollHaloBlur: 10,
  scrollHaloTop: true,
  scrollHaloBottom: true,
};

const HEX_RE = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

export function normalizeScrollHaloColorMode(raw: unknown): ScrollHaloColorMode {
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'custom' ? 'custom' : 'brand';
}

export function normalizeScrollHaloColor(raw: unknown): string {
  const s = String(raw ?? '').trim();
  return HEX_RE.test(s) ? s : '';
}

export function normalizeScrollHaloHeight(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  if (!Number.isFinite(n)) return DEFAULT_SCROLL_HALO.scrollHaloHeight;
  return Math.min(48, Math.max(8, Math.round(n)));
}

export function normalizeScrollHaloOpacity(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  if (!Number.isFinite(n)) return DEFAULT_SCROLL_HALO.scrollHaloOpacity;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function normalizeScrollHaloBlur(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  if (!Number.isFinite(n)) return DEFAULT_SCROLL_HALO.scrollHaloBlur;
  return Math.min(24, Math.max(0, Math.round(n)));
}

export function normalizeScrollHaloFields(
  raw: Record<string, unknown> | null | undefined,
): ScrollHaloConfig {
  const r = raw ?? {};
  return {
    scrollHaloEnabled: r.scrollHaloEnabled !== false,
    scrollHaloColorMode: normalizeScrollHaloColorMode(r.scrollHaloColorMode),
    scrollHaloColor: normalizeScrollHaloColor(r.scrollHaloColor),
    scrollHaloHeight: normalizeScrollHaloHeight(r.scrollHaloHeight),
    scrollHaloOpacity: normalizeScrollHaloOpacity(r.scrollHaloOpacity),
    scrollHaloBlur: normalizeScrollHaloBlur(r.scrollHaloBlur),
    scrollHaloTop: r.scrollHaloTop !== false,
    scrollHaloBottom: r.scrollHaloBottom !== false,
  };
}

export function pickWidgetScrollHaloPatch(cfg: Record<string, unknown>): Record<string, unknown> {
  return normalizeScrollHaloFields(cfg);
}

export function mergeWidgetScrollHaloFromApi<T extends WidgetConfig>(
  prev: T,
  widget: Record<string, unknown>,
): T {
  return {
    ...prev,
    ...normalizeScrollHaloFields(widget),
  };
}
