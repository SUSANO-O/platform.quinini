import { describe, it, expect } from 'vitest';
import { buildAgentFromQuiz, toCreateAgentPayload } from './quiz-to-agent';

describe('buildAgentFromQuiz', () => {
  it('personaliza nombre y prompt con el negocio', () => {
    const gen = buildAgentFromQuiz({
      businessType: 'ecommerce',
      goal: 'sell',
      tone: 'cercano',
      businessName: 'Zapatería Luna',
      language: 'es',
      collectFields: ['name', 'phone'],
    });
    expect(gen.name).toBe('Asistente de Zapatería Luna');
    expect(gen.systemPrompt).toContain('Zapatería Luna');
    expect(gen.systemPrompt).toContain('ayudar a vender');
    expect(gen.systemPrompt).toContain('nombre y teléfono');
    expect(gen.strictPurposeOnly).toBe(true);
    expect(gen.model).toBeTruthy();
  });

  it('cae a un template por defecto sin nombre de negocio', () => {
    const gen = buildAgentFromQuiz({ businessType: 'other', goal: 'support' });
    expect(gen.name).toBeTruthy();
    expect(gen.systemPrompt).toContain('honestidad');
  });

  it('incluye derivación a WhatsApp cuando hay número o meta leads', () => {
    const withWa = buildAgentFromQuiz({ goal: 'support', whatsapp: '+57 300 111 2222' });
    expect(withWa.systemPrompt).toContain('WhatsApp');
    expect(withWa.meta.whatsapp).toBe('+57 300 111 2222');
    const leads = buildAgentFromQuiz({ goal: 'leads' });
    expect(leads.systemPrompt).toContain('WhatsApp');
  });

  it('agrega el sitio web como fuente RAG solo si es URL válida', () => {
    expect(buildAgentFromQuiz({ website: 'https://x.com' }).ragSources).toHaveLength(1);
    expect(buildAgentFromQuiz({ website: 'no-es-url' }).ragSources).toHaveLength(0);
  });

  it('no pide datos si se eligió "none"', () => {
    const gen = buildAgentFromQuiz({ collectFields: ['none'] });
    expect(gen.systemPrompt).not.toContain('pídele');
  });

  it('incorpora oferta, ubicación, horario y handoff al prompt', () => {
    const gen = buildAgentFromQuiz({
      businessName: 'Luna',
      mainOffer: 'zapatos de cuero',
      location: 'Bogotá',
      hours: '247',
      handoff: 'complex',
    });
    expect(gen.systemPrompt).toContain('zapatos de cuero');
    expect(gen.systemPrompt).toContain('Bogotá');
    expect(gen.systemPrompt).toContain('24/7');
    expect(gen.systemPrompt).toContain('casos complejos');
  });

  it('toCreateAgentPayload produce el body esperado', () => {
    const gen = buildAgentFromQuiz({ businessType: 'ecommerce', businessName: 'Luna' });
    const payload = toCreateAgentPayload(gen);
    expect(payload.name).toBe(gen.name);
    expect(payload.systemPrompt).toBe(gen.systemPrompt);
    expect(payload.model).toBe(gen.model);
    expect(Array.isArray(payload.agentFaqs)).toBe(true);
    expect(payload.agentFaqs[0]).toHaveProperty('enabled', true);
  });
});
