import { describe, it, expect } from 'vitest';
import { timeAgo, formatDuration, sentimentTag } from '@/lib/chat-session-view';

describe('timeAgo', () => {
  const ahora = new Date('2026-09-13T17:00:00.000Z'); // 12:00 en Bogotá

  it('lo de recién es "ahora"', () => {
    expect(timeAgo('2026-09-13T16:59:30.000Z', ahora)).toBe('ahora');
  });

  it('minutos y horas', () => {
    expect(timeAgo('2026-09-13T16:40:00.000Z', ahora)).toBe('hace 20 min');
    expect(timeAgo('2026-09-13T14:00:00.000Z', ahora)).toBe('hace 3 h');
  });

  it('ayer se dice con palabra, no "hace 1 d"', () => {
    expect(timeAgo('2026-09-12T17:00:00.000Z', ahora)).toBe('ayer');
  });

  // Mismo criterio que el inbox: el día se mide en la zona del panel.
  it('cruzar la medianoche de Colombia ya cuenta como ayer', () => {
    expect(timeAgo('2026-09-12T21:00:00.000Z', ahora)).toBe('ayer');
  });

  it('más atrás cuenta días', () => {
    expect(timeAgo('2026-09-10T17:00:00.000Z', ahora)).toBe('hace 3 d');
  });

  it('sin fecha no pinta nada', () => {
    expect(timeAgo(null, ahora)).toBe('');
    expect(timeAgo('no-es-fecha', ahora)).toBe('');
  });
});

describe('formatDuration', () => {
  it('segundos', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('minutos', () => {
    expect(formatDuration(600)).toBe('10 min');
  });

  it('horas y minutos', () => {
    expect(formatDuration(3900)).toBe('1h 5m');
  });

  it('los límites exactos', () => {
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(3600)).toBe('1h 0m');
  });

  it('sin dato, un guion', () => {
    expect(formatDuration(null)).toBe('—');
  });

  // Una duración negativa vendría de relojes desincronizados; mejor un guion
  // que "-3s" en la tarjeta.
  it('una duración imposible da guion', () => {
    expect(formatDuration(-5)).toBe('—');
  });

  it('cero segundos es cero, no guion', () => {
    expect(formatDuration(0)).toBe('0s');
  });
});

describe('sentimentTag', () => {
  it('positivo y negativo tienen etiqueta', () => {
    expect(sentimentTag('positive')?.label).toBe('Positivo');
    expect(sentimentTag('negative')?.label).toBe('Negativo');
  });

  it('cada uno trae su papel de color', () => {
    expect(sentimentTag('positive')?.tone).toBe('success');
    expect(sentimentTag('negative')?.tone).toBe('danger');
  });

  // Neutro es la mayoría: marcarlo sería ruido en cada tarjeta.
  it('neutro y desconocido no pintan etiqueta', () => {
    expect(sentimentTag('neutral')).toBeNull();
    expect(sentimentTag('')).toBeNull();
    expect(sentimentTag('raro')).toBeNull();
  });
});
