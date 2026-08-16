/** Icono animado de la tarjeta “pensando” (Apariencia del widget). */

export const THINKING_ICONS = ['rubik', 'spark', 'orb', 'atom', 'pulse'] as const;
export type ThinkingIconId = (typeof THINKING_ICONS)[number];

export type ThinkingIconConfig = {
  thinkingIconEnabled: boolean;
  thinkingIcon: ThinkingIconId;
};

export const DEFAULT_THINKING_ICON: ThinkingIconConfig = {
  thinkingIconEnabled: true,
  thinkingIcon: 'rubik',
};

export const THINKING_ICON_OPTIONS: { id: ThinkingIconId; label: string; hint: string }[] = [
  { id: 'rubik', label: 'Cubo', hint: 'Cubo de Rubik en 3D' },
  { id: 'spark', label: 'Destello', hint: 'Estrella que gira' },
  { id: 'orb', label: 'Orbe', hint: 'Esfera con pulso' },
  { id: 'atom', label: 'Átomo', hint: 'Órbitas alrededor del núcleo' },
  { id: 'pulse', label: 'Pulso', hint: 'Anillos que se expanden' },
];

export function normalizeThinkingIcon(raw: unknown): ThinkingIconId {
  const s = String(raw ?? '').trim().toLowerCase();
  if ((THINKING_ICONS as readonly string[]).includes(s)) return s as ThinkingIconId;
  return DEFAULT_THINKING_ICON.thinkingIcon;
}

export function normalizeThinkingIconFields(
  raw: Record<string, unknown> | null | undefined,
): ThinkingIconConfig {
  const r = raw ?? {};
  return {
    thinkingIconEnabled: r.thinkingIconEnabled !== false,
    thinkingIcon: normalizeThinkingIcon(r.thinkingIcon),
  };
}

export function thinkingIconLabel(id: ThinkingIconId): string {
  const opt = THINKING_ICON_OPTIONS.find((o) => o.id === id);
  return opt ? opt.label : id;
}
