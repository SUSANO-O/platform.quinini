import { describe, expect, it } from 'vitest';
import {
  aiBeamShowsInput,
  aiBeamShowsMessages,
  mergeWidgetAppearanceFromApi,
  normalizeAiBeamFields,
  pickWidgetAppearancePatch,
} from '@/lib/widget-ai-beam';
import { DEFAULT_WIDGET_CONFIG } from '@/lib/widget-builder';

describe('widget-ai-beam', () => {
  it('defaults to both + rainbow', () => {
    const cfg = normalizeAiBeamFields({});
    expect(cfg.aiBeamScope).toBe('both');
    expect(cfg.aiBeamPalette).toBe('rainbow');
    expect(cfg.aiBeamBlur).toBe(4);
  });

  it('clamps blur speed intensity', () => {
    const cfg = normalizeAiBeamFields({
      aiBeamBlur: 99,
      aiBeamSpeed: 0.5,
      aiBeamIntensity: 200,
    });
    expect(cfg.aiBeamBlur).toBe(20);
    expect(cfg.aiBeamSpeed).toBe(2);
    expect(cfg.aiBeamIntensity).toBe(100);
  });

  it('pickWidgetAppearancePatch incluye aiBeam', () => {
    const patch = pickWidgetAppearancePatch({
      color: '#006B7D',
      aiBeamScope: 'input',
      aiBeamPalette: 'brand',
      aiBeamBlur: 8,
    });
    expect(patch.aiBeamScope).toBe('input');
    expect(patch.aiBeamPalette).toBe('brand');
    expect(patch.aiBeamBlur).toBe(8);
  });

  it('pickWidgetAppearancePatch incluye welcomeEnabled y voiceId', () => {
    const patch = pickWidgetAppearancePatch({ welcomeEnabled: false, voiceId: 'voice_x' });
    expect(patch.welcomeEnabled).toBe(false);
    expect(patch.voiceId).toBe('voice_x');
  });

  describe('mergeWidgetAppearanceFromApi', () => {
    it('welcomeEnabled: default true si el doc no trae el campo (widgets creados antes de este feature)', () => {
      const merged = mergeWidgetAppearanceFromApi(DEFAULT_WIDGET_CONFIG, { welcome: 'Hola' });
      expect(merged.welcomeEnabled).toBe(true);
    });

    it('welcomeEnabled: respeta false explícito', () => {
      const merged = mergeWidgetAppearanceFromApi(DEFAULT_WIDGET_CONFIG, { welcomeEnabled: false });
      expect(merged.welcomeEnabled).toBe(false);
    });

    it('voiceId: toma el del doc remoto', () => {
      const merged = mergeWidgetAppearanceFromApi(DEFAULT_WIDGET_CONFIG, { voiceId: 'voice_abc' });
      expect(merged.voiceId).toBe('voice_abc');
    });

    it('voiceId: sin el campo en el doc remoto, mantiene el previo (no lo borra)', () => {
      const merged = mergeWidgetAppearanceFromApi({ ...DEFAULT_WIDGET_CONFIG, voiceId: 'voice_prev' }, {});
      expect(merged.voiceId).toBe('voice_prev');
    });
  });
});
