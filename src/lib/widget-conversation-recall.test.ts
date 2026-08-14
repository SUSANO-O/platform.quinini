import { describe, expect, it } from 'vitest';
import { mergeContextBlocks, shouldRecallConversationMemory } from './widget-conversation-recall';

describe('shouldRecallConversationMemory', () => {
  it('recuerda en un mensaje normal con sesion', () => {
    expect(shouldRecallConversationMemory({ trivial: false, sessionId: 'sess_abc' })).toBe(true);
  });

  it('no gasta un embedding en saludos', () => {
    expect(shouldRecallConversationMemory({ trivial: true, sessionId: 'sess_abc' })).toBe(false);
  });

  it('sin sessionId no hay nada que acotar', () => {
    expect(shouldRecallConversationMemory({ trivial: false, sessionId: '' })).toBe(false);
    expect(shouldRecallConversationMemory({ trivial: false, sessionId: '   ' })).toBe(false);
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
