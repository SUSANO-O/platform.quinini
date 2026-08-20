import { describe, expect, it } from 'vitest';
import { mergeContextBlocks, shouldRecallConversationMemory } from './widget-conversation-recall';

describe('shouldRecallConversationMemory', () => {
  it('recuerda solo si el mensaje pide un recuerdo', () => {
    expect(
      shouldRecallConversationMemory({
        trivial: false,
        sessionId: 'sess_abc',
        message: 'Oye, cuantos kilometros te dije que tenia mi carro?',
      }),
    ).toBe(true);
  });

  it('no gasta embedding en catálogo/FAQ', () => {
    expect(
      shouldRecallConversationMemory({
        trivial: false,
        sessionId: 'sess_abc',
        message: 'cuánto cuesta el plan Pro?',
      }),
    ).toBe(false);
  });

  it('no gasta un embedding en saludos', () => {
    expect(
      shouldRecallConversationMemory({
        trivial: true,
        sessionId: 'sess_abc',
        message: 'hola',
      }),
    ).toBe(false);
  });

  it('sin sessionId ni visitorId no hay nada que acotar', () => {
    expect(
      shouldRecallConversationMemory({
        trivial: false,
        sessionId: '',
        message: 'te acuerdas del color?',
      }),
    ).toBe(false);
  });

  it('sin message no recall (legacy safe)', () => {
    expect(shouldRecallConversationMemory({ trivial: false, sessionId: 'sess_abc' })).toBe(false);
  });
});

describe('mergeContextBlocks', () => {
  it('une contexto de sesion y memoria', () => {
    expect(mergeContextBlocks('sesion', 'memoria')).toBe('sesion\n\nmemoria');
  });

  it('descarta vacios, nulos y espacios', () => {
    expect(mergeContextBlocks('', null, undefined, '  ', 'memoria')).toBe('memoria');
  });

  it('no duplica un bloque repetido', () => {
    expect(mergeContextBlocks('igual', 'igual')).toBe('igual');
  });

  it('recorta cada bloque', () => {
    expect(mergeContextBlocks('  sesion  ', '  memoria  ')).toBe('sesion\n\nmemoria');
  });

  it('sin bloques devuelve cadena vacia', () => {
    expect(mergeContextBlocks()).toBe('');
    expect(mergeContextBlocks(undefined, '')).toBe('');
  });
});
