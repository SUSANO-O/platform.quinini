import { describe, expect, it } from 'vitest';
import {
  baseSystemPrompt,
  mergeSystemPromptWithManagedBlocks,
  normalizeBehaviorRule,
} from '@/lib/agent-managed-prompt';

const rule = normalizeBehaviorRule({ title: 'Breve', interpretedRule: 'Responde en pocas frases.' }, 0);
const faq = { id: 'f1', question: '¿Horario?', answer: 'Lunes a viernes 8–6.', enabled: true, priority: 0 };

describe('agent-managed-prompt', () => {
  it('base + reglas + FAQ; el base se recupera intacto', () => {
    const full = mergeSystemPromptWithManagedBlocks('Eres Navi.', [rule], [faq], []);
    expect(full.startsWith('Eres Navi.')).toBe(true);
    expect(full).toContain('[AFHUB_RULES_START]');
    expect(full).toContain('Responde en pocas frases.');
    expect(full).toContain('¿Horario?');
    expect(baseSystemPrompt(full)).toBe('Eres Navi.');
  });

  it('reconstruir sobre un prompt ya fusionado no duplica bloques', () => {
    const once = mergeSystemPromptWithManagedBlocks('Eres Navi.', [rule], [faq], []);
    const twice = mergeSystemPromptWithManagedBlocks(once, [rule], [faq], []);
    expect(twice).toBe(once);
    expect(twice.split('[AFHUB_RULES_START]').length).toBe(2);
  });

  it('normalizeBehaviorRule completa los valores por defecto del editor', () => {
    expect(normalizeBehaviorRule({}, 2)).toMatchObject({
      id: 'rule_2', title: 'Regla', enabled: true, priority: 20, category: 'general', tone: 'profesional', shortAnswers: false,
    });
    expect(normalizeBehaviorRule({ enabled: false, priority: 5 }, 0)).toMatchObject({ enabled: false, priority: 5 });
  });
});
