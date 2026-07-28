import { describe, expect, it } from 'vitest';
import { agentDetailPath, parseAgentTabHash } from '../dashboard-url-hash';

describe('dashboard-url-hash', () => {
  it('parsea alias en español', () => {
    expect(parseAgentTabHash('#reglas')).toBe('rules');
    expect(parseAgentTabHash('herramientas')).toBe('tools');
    expect(parseAgentTabHash('almacen')).toBe('rag');
  });

  it('parsea ids canónicos', () => {
    expect(parseAgentTabHash('#general')).toBe('general');
    expect(parseAgentTabHash('#scheduled-tasks')).toBe('scheduled-tasks');
  });

  it('devuelve null para hash desconocido', () => {
    expect(parseAgentTabHash('#foo')).toBeNull();
    expect(parseAgentTabHash('')).toBeNull();
  });

  it('construye path con hash', () => {
    expect(agentDetailPath('abc123')).toBe('/dashboard/agents/abc123');
    expect(agentDetailPath('abc123', 'rules')).toBe('/dashboard/agents/abc123#rules');
    expect(agentDetailPath('abc123', 'general')).toBe('/dashboard/agents/abc123');
  });
});
