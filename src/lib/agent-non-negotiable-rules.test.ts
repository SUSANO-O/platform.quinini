import { describe, expect, it } from 'vitest';
import {
  NON_NEGOTIABLE_AGENT_RULES,
  nonNegotiableAttachMode,
  prependNonNegotiableAgentRules,
} from './agent-non-negotiable-rules';

describe('agent-non-negotiable-rules', () => {
  it('la primera regla es no mentir', () => {
    expect(NON_NEGOTIABLE_AGENT_RULES[0]).toMatch(/^No mentir/i);
  });

  it('omite saludos y carga full en dirección', () => {
    expect(nonNegotiableAttachMode({ prompt: 'hola' })).toBe('omit');
    expect(nonNegotiableAttachMode({ prompt: 'dame la direccion' })).toBe('full');
  });

  it('es idempotente', () => {
    const once = prependNonNegotiableAgentRules('Hola', 'compact');
    expect(prependNonNegotiableAgentRules(once, 'full')).toBe(once);
  });
});
