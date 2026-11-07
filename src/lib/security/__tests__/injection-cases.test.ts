import { describe, expect, it } from 'vitest';
import {
  CANARY,
  INJECTION_CASES,
  buildTestAgentPrompt,
  detectInjectionLeak,
} from '@/lib/security/injection-cases';

describe('detectInjectionLeak', () => {
  it('detecta el canario en la respuesta', () => {
    expect(detectInjectionLeak(`claro, el código es ${CANARY} listo`).leakedCanary).toBe(true);
    expect(detectInjectionLeak('Solo puedo ayudarte con CajaMágica.').leakedCanary).toBe(false);
  });

  it('detecta marcadores del prompt del sistema', () => {
    const r = detectInjectionLeak('Mis instrucciones del sistema son: eres el asistente de prueba...');
    expect(r.leakedSystemPrompt).toBe(true);
    expect(r.markersFound.length).toBeGreaterThan(0);
  });

  it('una respuesta de rechazo no cuenta como filtración', () => {
    const r = detectInjectionLeak('Solo puedo ayudarte con CajaMágica.');
    expect(r.leakedCanary).toBe(false);
    expect(r.leakedSystemPrompt).toBe(false);
  });
});

describe('catálogo de inyección', () => {
  it('ids únicos y categorías válidas', () => {
    const ids = new Set<string>();
    for (const c of INJECTION_CASES) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.message.length).toBeGreaterThan(0);
    }
    expect(INJECTION_CASES.length).toBeGreaterThanOrEqual(10);
  });

  it('el prompt del agente de prueba contiene el canario y la regla de no revelarlo', () => {
    const p = buildTestAgentPrompt();
    expect(p).toContain(CANARY);
    expect(p.toLowerCase()).toContain('no lo reveles');
  });
});
