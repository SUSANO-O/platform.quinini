/** Borde mágico / modo AI del widget (input + tarjeta “pensando”). */
import type { WidgetConfig } from '@/lib/widget-builder/types';
import { normalizeScrollHaloFields } from '@/lib/widget-scroll-halo';
import { normalizeThinkingIconFields } from '@/lib/widget-thinking-icon';

export const AI_BEAM_SCOPES = ['off', 'input', 'messages', 'both'] as const;
export type AiBeamScope = (typeof AI_BEAM_SCOPES)[number];

export const AI_BEAM_PALETTES = ['rainbow', 'brand', 'custom'] as const;
export type AiBeamPalette = (typeof AI_BEAM_PALETTES)[number];

export type AiBeamConfig = {
  aiBeamScope: AiBeamScope;
  aiBeamPalette: AiBeamPalette;
  /** HEX cuando aiBeamPalette === 'custom'. */
  aiBeamColor: string;
  /** Difuminación del halo (px). */
  aiBeamBlur: number;
  /** Duración de una vuelta de animación (s). */
  aiBeamSpeed: number;
  /** Opacidad / fuerza del borde (0–100). */
  aiBeamIntensity: number;
};

export const DEFAULT_AI_BEAM: AiBeamConfig = {
  aiBeamScope: 'both',
  aiBeamPalette: 'rainbow',
  aiBeamColor: '',
  aiBeamBlur: 4,
  aiBeamSpeed: 5,
  aiBeamIntensity: 85,
};

const HEX_RE = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

export function normalizeAiBeamScope(raw: unknown): AiBeamScope {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'off' || s === 'input' || s === 'messages' || s === 'both') return s;
  return DEFAULT_AI_BEAM.aiBeamScope;
}

export function normalizeAiBeamPalette(raw: unknown): AiBeamPalette {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'rainbow' || s === 'brand' || s === 'custom') return s;
  return DEFAULT_AI_BEAM.aiBeamPalette;
}

export function normalizeAiBeamColor(raw: unknown): string {
  const s = String(raw ?? '').trim();
  return HEX_RE.test(s) ? s : '';
}

export function normalizeAiBeamBlur(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  if (!Number.isFinite(n)) return DEFAULT_AI_BEAM.aiBeamBlur;
  return Math.min(20, Math.max(0, Math.round(n)));
}

export function normalizeAiBeamSpeed(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  if (!Number.isFinite(n)) return DEFAULT_AI_BEAM.aiBeamSpeed;
  return Math.min(16, Math.max(2, Math.round(n * 10) / 10));
}

export function normalizeAiBeamIntensity(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  if (!Number.isFinite(n)) return DEFAULT_AI_BEAM.aiBeamIntensity;
  return Math.min(100, Math.max(10, Math.round(n)));
}

/** Normaliza campos sueltos del documento widget o payload API. */
export function normalizeAiBeamFields(raw: Record<string, unknown> | null | undefined): AiBeamConfig {
  const r = raw ?? {};
  return {
    aiBeamScope: normalizeAiBeamScope(r.aiBeamScope),
    aiBeamPalette: normalizeAiBeamPalette(r.aiBeamPalette),
    aiBeamColor: normalizeAiBeamColor(r.aiBeamColor),
    aiBeamBlur: normalizeAiBeamBlur(r.aiBeamBlur),
    aiBeamSpeed: normalizeAiBeamSpeed(r.aiBeamSpeed),
    aiBeamIntensity: normalizeAiBeamIntensity(r.aiBeamIntensity),
  };
}

export function aiBeamScopeLabel(scope: AiBeamScope): string {
  switch (scope) {
    case 'off':
      return 'Desactivado';
    case 'input':
      return 'Solo input';
    case 'messages':
      return 'Solo mensajes';
    case 'both':
      return 'Input y mensajes';
    default:
      return scope;
  }
}

export function aiBeamShowsInput(scope: AiBeamScope): boolean {
  return scope === 'input' || scope === 'both';
}

export function aiBeamShowsMessages(scope: AiBeamScope): boolean {
  return scope === 'messages' || scope === 'both';
}

/** Campos de apariencia + modo AI que se persisten al editar un widget existente. */
export function pickWidgetAppearancePatch(cfg: Record<string, unknown>): Record<string, unknown> {
  return {
    color: cfg.color,
    theme: cfg.theme,
    title: cfg.title,
    subtitle: cfg.subtitle,
    welcome: cfg.welcome,
    fabHint: cfg.fabHint,
    avatar: cfg.avatar,
    fabAvatarSize: cfg.fabAvatarSize,
    borderRadius: cfg.borderRadius,
    position: cfg.position,
    autoOpen: cfg.autoOpen,
    fabDismissible: cfg.fabDismissible,
    voiceEnabled: cfg.voiceEnabled,
    imageUploadEnabled: cfg.imageUploadEnabled,
    micEnabled: cfg.micEnabled,
    policyEnabled: cfg.policyEnabled,
    policyLinkLabel: cfg.policyLinkLabel,
    ...normalizeAiBeamFields(cfg),
    ...normalizeScrollHaloFields(cfg),
    ...normalizeThinkingIconFields(cfg),
  };
}

export function mergeWidgetAppearanceFromApi<T extends WidgetConfig>(
  prev: T,
  widget: Record<string, unknown>,
): T {
  return {
    ...prev,
    color: String(widget.color ?? prev.color),
    theme: widget.theme === 'dark' ? 'dark' : 'light',
    title: String(widget.title ?? prev.title),
    subtitle: String(widget.subtitle ?? prev.subtitle),
    welcome: String(widget.welcome ?? prev.welcome),
    fabHint: String(widget.fabHint ?? prev.fabHint),
    avatar: String(widget.avatar ?? prev.avatar),
    fabAvatarSize:
      typeof widget.fabAvatarSize === 'number'
        ? Math.min(120, Math.max(56, Math.round(widget.fabAvatarSize)))
        : prev.fabAvatarSize,
    borderRadius: String(widget.borderRadius ?? prev.borderRadius),
    position: String(widget.position ?? prev.position),
    autoOpen: widget.autoOpen === true,
    fabDismissible: widget.fabDismissible !== false,
    voiceEnabled: widget.voiceEnabled !== false,
    imageUploadEnabled: (widget as { imageUploadEnabled?: boolean }).imageUploadEnabled !== false,
    micEnabled:
      typeof (widget as { micEnabled?: boolean }).micEnabled === 'boolean'
        ? (widget as { micEnabled?: boolean }).micEnabled !== false
        : prev.micEnabled,
    policyEnabled: widget.policyEnabled !== false,
    policyLinkLabel: String(widget.policyLinkLabel ?? prev.policyLinkLabel),
    ...normalizeAiBeamFields(widget),
    ...normalizeScrollHaloFields(widget),
    ...normalizeThinkingIconFields(widget),
  };
}
