import { describe, expect, it } from 'vitest';
import {
  parsePlatformUiClassification,
  formatPlatformUiClassificationHint,
  platformUiSignatureBlock,
} from '@/lib/botiva-platform-ui-reference';

describe('botiva-platform-ui-reference', () => {
  it('parsea clasificación no-BotIvA', () => {
    const analysis = `
Descripción...

[CLASIFICACIÓN UI BOTIVA]
coincide_dashboard: no
confianza: alta
señales_botiva: ninguna
señales_externas: logo Amazon
`;
    const c = parsePlatformUiClassification(analysis);
    expect(c.matchesDashboard).toBe('no');
    expect(c.confidence).toBe('alta');
    expect(formatPlatformUiClassificationHint(analysis)).toMatch(/NO parece ser del dashboard BotIvA/i);
  });

  it('memoria visual incluye sidebar', () => {
    expect(platformUiSignatureBlock()).toMatch(/Barra lateral/i);
  });
});
