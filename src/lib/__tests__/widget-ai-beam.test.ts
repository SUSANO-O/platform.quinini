import { describe, expect, it } from 'vitest';
import {
  aiBeamShowsInput,
  aiBeamShowsMessages,
  normalizeAiBeamFields,
  pickWidgetAppearancePatch,
} from '@/lib/widget-ai-beam';

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
});
