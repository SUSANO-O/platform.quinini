import { describe, expect, it } from 'vitest';
import {
  buildFaqAnswerSample,
  extractFaqQuestionText,
  getPromotableFaqCandidates,
  isReusableFaqAnswer,
  isUsefulFaqCandidateMessage,
  MAX_FAQ_ANSWER_SAMPLE,
  MIN_FAQ_CANDIDATE_REPETITIONS,
  normalizeFaqKey,
  userMessageMatchesRegisteredFaq,
  type FaqCandidateRow,
} from '../agent-faq-utils';

describe('isReusableFaqAnswer', () => {
  it('acepta una respuesta que fija un dato del negocio', () => {
    expect(isReusableFaqAnswer('El envío tarda entre 3 y 5 días hábiles a península.')).toBe(true);
  });

  /** Las cifras cortas son justo lo que interesa fijar en una FAQ. */
  it('acepta precios', () => {
    expect(isReusableFaqAnswer('El plan básico cuesta 29 euros al mes, sin permanencia.')).toBe(true);
  });

  it('rechaza disculpas y respuestas que no fijan nada', () => {
    expect(isReusableFaqAnswer('Lo siento, no tengo acceso a esa información en este momento.')).toBe(false);
    expect(isReusableFaqAnswer('No puedo ayudarte con eso, intenta de nuevo mas tarde.')).toBe(false);
  });

  it('rechaza respuestas con datos de quien preguntaba', () => {
    expect(isReusableFaqAnswer('Te lo he enviado a maria.lopez@example.com como pediste.')).toBe(false);
    expect(isReusableFaqAnswer('Tu pedido 4471822 sale mañana desde el almacen central.')).toBe(false);
    expect(isReusableFaqAnswer('Puedes llamarnos al 612 345 678 para cualquier consulta.')).toBe(false);
  });

  it('rechaza respuestas demasiado cortas para servir de FAQ', () => {
    expect(isReusableFaqAnswer('Sí, claro.')).toBe(false);
    expect(isReusableFaqAnswer('')).toBe(false);
  });
});

describe('buildFaqAnswerSample', () => {
  it('normaliza espacios y saltos de linea', () => {
    expect(buildFaqAnswerSample('El envío   tarda\n\n3 días hábiles siempre.')).toBe(
      'El envío tarda 3 días hábiles siempre.',
    );
  });

  it('recorta las respuestas largas', () => {
    const largo = `El envío tarda tres días. ${'detalle '.repeat(200)}`;
    expect(buildFaqAnswerSample(largo)).toHaveLength(MAX_FAQ_ANSWER_SAMPLE);
  });

  it('devuelve vacio cuando la respuesta no sirve', () => {
    expect(buildFaqAnswerSample('Lo siento, no tengo acceso a esa información ahora.')).toBe('');
    expect(buildFaqAnswerSample(undefined as unknown as string)).toBe('');
  });
});

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
