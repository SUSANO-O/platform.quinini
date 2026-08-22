import { describe, expect, it } from 'vitest';
import {
  resolveAssistScriptUrl,
  resolveInternalAssistBoot,
  WIDGET_SDK_VERSION,
} from '@/lib/internal-assist-config';

describe('resolveInternalAssistBoot', () => {
  it('returns app defaults for dashboard context', () => {
    const cfg = resolveInternalAssistBoot('app', 'https://app.example.com');
    expect(cfg.agentId).toBe('math-ais');
    expect(cfg.position).toBe('bottom-right');
    expect(cfg.host).toBe('https://app.example.com');
    // Contexto 'app' (dashboard) usa un neutro oscuro; el teal #006B7D es el
    // default de 'marketing' (ver test de abajo) — no del dashboard.
    expect(cfg.color).toBe('#111111');
  });

  it('returns marketing defaults', () => {
    const cfg = resolveInternalAssistBoot('marketing', 'https://app.example.com');
    expect(cfg.agentId).toBe('math');
    expect(cfg.host).toBe('https://app.example.com');
    expect(cfg.fabHint).toBe('Hola! Como puedo ayudarte hoy?');
    expect(cfg.avatar).toBe('/assets/marketing/botiva-orb.png?v=orb-teal2');
    expect(cfg.avatar).not.toContain('botiva-logo');
    expect(cfg.fabAvatarSize).toBe(72);
  });

  it('prefers request origin over NEXT_PUBLIC_APP_URL for widget host', () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://preview.vercel.app';
    try {
      const cfg = resolveInternalAssistBoot('marketing', 'https://botiva.space');
      expect(cfg.host).toBe('https://botiva.space');
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = prev;
    }
  });
});

describe('resolveAssistScriptUrl', () => {
  it('defaults to /assist.js on origin', () => {
    // Contra la constante en vivo, no un número pisado — así no vuelve a
    // desactualizarse en cada bump de WIDGET_SDK_VERSION.
    expect(resolveAssistScriptUrl('https://botiva.example.com')).toBe(
      `https://botiva.example.com/assist.js?v=${WIDGET_SDK_VERSION}`,
    );
  });
});
