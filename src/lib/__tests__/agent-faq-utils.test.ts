import { describe, expect, it } from 'vitest';
import {
  extractFaqQuestionText,
  getPromotableFaqCandidates,
  isUsefulFaqCandidateMessage,
  MIN_FAQ_CANDIDATE_REPETITIONS,
  normalizeFaqKey,
  userMessageMatchesRegisteredFaq,
  type FaqCandidateRow,
} from '../agent-faq-utils';

describe('agent-faq-utils', () => {
  it('ignora saludos y ruido como candidatas', () => {
    expect(isUsefulFaqCandidateMessage('hola')).toBe(false);
    expect(isUsefulFaqCandidateMessage('gracias')).toBe(false);
    expect(isUsefulFaqCandidateMessage('ok perfecto')).toBe(false);
  });

  it('acepta preguntas reales del widget', () => {
    expect(
      isUsefulFaqCandidateMessage('¿Cuánto cuesta el plan Plus y qué incluye?'),
    ).toBe(true);
    expect(
      isUsefulFaqCandidateMessage('Hola, necesito información sobre devoluciones'),
    ).toBe(true);
  });

  it('extractFaqQuestionText prioriza la frase con signo de pregunta', () => {
    const q = extractFaqQuestionText(
      'Hola buenos días. Quiero un banner. ¿Cuánto cuesta el plan Business?',
    );
    expect(q).toContain('¿Cuánto cuesta el plan Business?');
  });

  it('normalizeFaqKey deduplica variantes de la misma pregunta', () => {
    const a = normalizeFaqKey('¿Cuánto cuesta el plan Plus?');
    const b = normalizeFaqKey('cuanto cuesta el plan plus');
    expect(a).toBe(b);
  });

  it('getPromotableFaqCandidates solo devuelve count >= 4 y preguntas útiles', () => {
    const rows: FaqCandidateRow[] = [
      {
        id: '1',
        key: 'precio plan',
        questionSample: '¿Cuánto cuesta el plan Plus?',
        count: 2,
        lastSeen: new Date().toISOString(),
      },
      {
        id: '2',
        key: 'hola',
        questionSample: 'hola',
        count: 10,
        lastSeen: new Date().toISOString(),
      },
      {
        id: '3',
        key: 'devolucion',
        questionSample: '¿Cómo pido una devolución?',
        count: MIN_FAQ_CANDIDATE_REPETITIONS,
        lastSeen: new Date().toISOString(),
      },
    ];
    const out = getPromotableFaqCandidates(rows);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('3');
  });

  it('userMessageMatchesRegisteredFaq detecta equivalencia aproximada', () => {
    const match = userMessageMatchesRegisteredFaq('cuanto cuesta el plan plus?', [
      { question: '¿Cuánto cuesta el plan Plus?', enabled: true },
    ]);
    expect(match).toBe(true);
  });
});
