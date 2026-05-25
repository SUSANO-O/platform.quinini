import { describe, expect, it } from 'vitest';
import { resolveAssistScriptUrl, resolveInternalAssistBoot } from '@/lib/internal-assist-config';

describe('resolveInternalAssistBoot', () => {
  it('returns app defaults for dashboard context', () => {
    const cfg = resolveInternalAssistBoot('app', 'https://app.example.com');
    expect(cfg.agentId).toBe('math-ais');
    expect(cfg.position).toBe('bottom-right');
    expect(cfg.host).toBe('https://app.example.com');
    expect(cfg.color).toBe('#fb0e0e');
  });

  it('returns marketing defaults', () => {
    const cfg = resolveInternalAssistBoot('marketing', 'https://app.example.com');
    expect(cfg.agentId).toBe('math');
    expect(cfg.fabHint).toBe('preguntame lo que necesites');
    expect(cfg.avatar).toContain('freepik');
  });
});

describe('resolveAssistScriptUrl', () => {
  it('defaults to /assist.js on origin', () => {
    expect(resolveAssistScriptUrl('https://botiva.example.com')).toBe('https://botiva.example.com/assist.js');
  });
});
