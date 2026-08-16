import { describe, expect, it } from 'vitest';
import {
  normalizeThinkingIcon,
  normalizeThinkingIconFields,
  thinkingIconLabel,
} from '@/lib/widget-thinking-icon';
import { pickWidgetAppearancePatch } from '@/lib/widget-ai-beam';

describe('widget-thinking-icon', () => {
  it('por defecto deja el cubo Rubik activo', () => {
    const cfg = normalizeThinkingIconFields({});
    expect(cfg.thinkingIconEnabled).toBe(true);
    expect(cfg.thinkingIcon).toBe('rubik');
  });

  it('acepta iconos conocidos y descarta valores raros', () => {
    expect(normalizeThinkingIcon('spark')).toBe('spark');
    expect(normalizeThinkingIcon('ORB')).toBe('orb');
    expect(normalizeThinkingIcon('nope')).toBe('rubik');
  });

  it('se puede apagar el icono', () => {
    const cfg = normalizeThinkingIconFields({ thinkingIconEnabled: false, thinkingIcon: 'atom' });
    expect(cfg.thinkingIconEnabled).toBe(false);
    expect(cfg.thinkingIcon).toBe('atom');
  });

  it('pickWidgetAppearancePatch incluye el icono de pensando', () => {
    const patch = pickWidgetAppearancePatch({
      color: '#006B7D',
      thinkingIconEnabled: false,
      thinkingIcon: 'pulse',
    });
    expect(patch.thinkingIconEnabled).toBe(false);
    expect(patch.thinkingIcon).toBe('pulse');
  });

  it('thinkingIconLabel devuelve el nombre en español', () => {
    expect(thinkingIconLabel('rubik')).toBe('Cubo');
  });
});
