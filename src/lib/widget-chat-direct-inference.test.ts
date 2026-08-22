import { describe, expect, it } from 'vitest';
import { softenJsonOnlyReply } from './widget-chat-direct-inference';

describe('softenJsonOnlyReply', () => {
  it('deja pasar texto normal sin tocar', () => {
    expect(softenJsonOnlyReply('Hola, ¿en qué te ayudo?')).toBe('Hola, ¿en qué te ayudo?');
  });

  it('extrae el reply anidado cuando el modelo devuelve JSON crudo (caso router)', () => {
    const raw = '{"action":"chat","reply":"¡Hola! ¿En qué área de tu LifeOS Hub te gustaría trabajar hoy?"}';
    expect(softenJsonOnlyReply(raw)).toBe('¡Hola! ¿En qué área de tu LifeOS Hub te gustaría trabajar hoy?');
  });

  it('extrae reply aunque el JSON traiga más campos (add_XXX)', () => {
    const raw = '{"action":"add_agua","amount":500,"reply":"¡Anotado! 500ml de agua."}';
    expect(softenJsonOnlyReply(raw)).toBe('¡Anotado! 500ml de agua.');
  });

  it('sin campo reply, deja pasar el JSON tal cual (no inventa una ficha genérica acá)', () => {
    const raw = '{"status":200,"ok":true}';
    expect(softenJsonOnlyReply(raw)).toBe(raw);
  });

  it('reply vacío no cuenta como presente — deja pasar el JSON original', () => {
    const raw = '{"action":"chat","reply":""}';
    expect(softenJsonOnlyReply(raw)).toBe(raw);
  });

  it('JSON de array no se toca (no es el shape esperado)', () => {
    const raw = '[{"a":1}]';
    expect(softenJsonOnlyReply(raw)).toBe(raw);
  });

  it('JSON inválido no rompe, se devuelve tal cual', () => {
    const raw = '{not valid json';
    expect(softenJsonOnlyReply(raw)).toBe(raw);
  });

  it('texto que no arranca ni termina en llaves no se toca', () => {
    const text = 'El precio es {"aprox"} 500 pesos';
    expect(softenJsonOnlyReply(text)).toBe(text);
  });
});
