import { describe, expect, it } from 'vitest';
import {
  emitStreamTokensFromText,
  splitTextForStreamTokens,
  streamChunkDelayMs,
} from '@/lib/widget-stream-reply';

describe('widget-stream-reply', () => {
  it('no trocea textos cortos', () => {
    expect(splitTextForStreamTokens('Hola')).toEqual(['Hola']);
  });

  it('trocea textos largos en varias partes', () => {
    const long =
      'Esta es una respuesta bastante larga que debería dividirse en varios tokens para el widget.';
    const parts = splitTextForStreamTokens(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe(long);
  });

  it('emitStreamTokensFromText envía un token para texto corto', async () => {
    const events: Array<Record<string, unknown>> = [];
    await emitStreamTokensFromText((e) => events.push(e), 'OK');
    expect(events).toEqual([{ type: 'token', text: 'OK' }]);
  });

  it('emitStreamTokensFromText envía múltiples tokens para texto largo', async () => {
    const events: Array<Record<string, unknown>> = [];
    const long =
      'Primero explico el contexto. Luego detallo los pasos. Finalmente cierro con una recomendación clara para el usuario.';
    await emitStreamTokensFromText((e) => events.push(e), long);
    const tokens = events.filter((e) => e.type === 'token');
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.map((t) => t.text).join('')).toBe(long);
  });

  it('streamChunkDelayMs acota el retardo', () => {
    expect(streamChunkDelayMs(1)).toBe(0);
    expect(streamChunkDelayMs(200)).toBeGreaterThanOrEqual(8);
    expect(streamChunkDelayMs(200)).toBeLessThanOrEqual(32);
  });
});
