import { describe, expect, it } from 'vitest';
import { isTrivialMessage } from './trivial-message';

describe('isTrivialMessage', () => {
  it('detecta saludos simples', () => {
    expect(isTrivialMessage('hola')).toBe(true);
    expect(isTrivialMessage('Hola!')).toBe(true);
    expect(isTrivialMessage('buenas')).toBe(true);
    expect(isTrivialMessage('Buenos días')).toBe(true);
    expect(isTrivialMessage('hey')).toBe(true);
    expect(isTrivialMessage('qué tal')).toBe(true);
  });

  it('detecta cortesías y cierres', () => {
    expect(isTrivialMessage('gracias')).toBe(true);
    expect(isTrivialMessage('muchas gracias')).toBe(true);
    expect(isTrivialMessage('perfecto')).toBe(true);
    expect(isTrivialMessage('chao')).toBe(true);
    expect(isTrivialMessage('jajaja')).toBe(true);
  });

  it('NO acelera mensajes con intención real', () => {
    expect(isTrivialMessage('hola cuánto cuesta?')).toBe(false);
    expect(isTrivialMessage('quiero una cotización')).toBe(false);
    expect(isTrivialMessage('buenas, necesito ayuda')).toBe(false);
    expect(isTrivialMessage('hola, cómo agendo una cita')).toBe(false);
    expect(isTrivialMessage('me das info de los planes')).toBe(false);
  });

  it('NO acelera preguntas', () => {
    expect(isTrivialMessage('hola?')).toBe(false);
    expect(isTrivialMessage('¿están ahí?')).toBe(false);
  });

  it('NO acelera mensajes con email o teléfono', () => {
    expect(isTrivialMessage('hola soy juan@mail.com')).toBe(false);
    expect(isTrivialMessage('hola 3001234567')).toBe(false);
  });

  it('NO acelera mensajes largos', () => {
    expect(isTrivialMessage('hola hola hola hola hola hola hola hola hola')).toBe(false);
  });

  it('NO acelera tokens desconocidos (conservador)', () => {
    expect(isTrivialMessage('hola pikachu')).toBe(false);
    expect(isTrivialMessage('transferencia bancaria')).toBe(false);
  });

  it('acelera confirmaciones ambiguas sin contexto de pregunta', () => {
    expect(isTrivialMessage('ok gracias')).toBe(true);
    expect(isTrivialMessage('ok')).toBe(true);
  });

  it('NO acelera confirmaciones ambiguas tras una pregunta del bot', () => {
    const history = [
      { role: 'user', content: 'quiero una cita' },
      { role: 'model', content: '¿Te agendo para mañana a las 3pm?' },
    ];
    expect(isTrivialMessage('ok', history)).toBe(false);
    expect(isTrivialMessage('sí', history)).toBe(false);
    expect(isTrivialMessage('dale', history)).toBe(false);
  });

  it('sí acelera saludos puros aunque el bot haya preguntado', () => {
    const history = [
      { role: 'model', content: '¿En qué te ayudo?' },
    ];
    expect(isTrivialMessage('gracias', history)).toBe(true);
  });

  it('maneja entradas vacías / inválidas', () => {
    expect(isTrivialMessage('')).toBe(false);
    expect(isTrivialMessage('   ')).toBe(false);
    // @ts-expect-error probando entrada no-string
    expect(isTrivialMessage(null)).toBe(false);
  });
});
