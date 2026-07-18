import { describe, expect, it } from 'vitest';
import {
  buildSupportVisionPrompt,
  inferWidgetScreenshotContext,
} from '@/lib/widget-image-vision-context';

describe('widget-image-vision-context', () => {
  it('detecta captura del dashboard BotIvA', () => {
    const ctx = inferWidgetScreenshotContext({ pagePath: '/dashboard/agents' });
    expect(ctx.kind).toBe('botiva_dashboard');
    expect(ctx.originLabel).toMatch(/dashboard BotIvA/i);
    expect(buildSupportVisionPrompt(ctx)).toMatch(/dashboard BotIvA/i);
  });

  it('detecta captura desde sitio del visitante con URL', () => {
    const ctx = inferWidgetScreenshotContext({
      pagePath: 'https://tienda-cliente.com/productos/123',
    });
    expect(ctx.kind).toBe('visitor_site');
    expect(ctx.originLabel).toMatch(/widget BotIvA embebido/i);
    expect(ctx.pagePath).toContain('tienda-cliente.com');
  });

  it('sin pagePath sigue siendo widget BotIvA', () => {
    const ctx = inferWidgetScreenshotContext({});
    expect(ctx.originLabel).toMatch(/widget BotIvA/i);
  });
});
