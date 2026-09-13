import { describe, it, expect } from 'vitest';
import {
  PANEL_TIMEZONE,
  dayKeyInTimeZone,
  daysApartInTimeZone,
  formatDayLabel,
} from '@/lib/panel-dates';

describe('PANEL_TIMEZONE', () => {
  it('es la zona con la que el panel calcula todo lo demás', () => {
    expect(PANEL_TIMEZONE).toBe('America/Bogota');
  });
});

describe('dayKeyInTimeZone', () => {
  it('da el día en la zona pedida, no en UTC', () => {
    // 02:00 UTC del 14 son todavía las 21:00 del 13 en Colombia.
    expect(dayKeyInTimeZone(new Date('2026-09-14T02:00:00.000Z'))).toBe('2026-09-13');
  });

  it('a mediodía UTC coinciden', () => {
    expect(dayKeyInTimeZone(new Date('2026-09-13T12:00:00.000Z'))).toBe('2026-09-13');
  });

  it('el cambio de día ocurre a las 05:00 UTC', () => {
    expect(dayKeyInTimeZone(new Date('2026-09-13T04:59:00.000Z'))).toBe('2026-09-12');
    expect(dayKeyInTimeZone(new Date('2026-09-13T05:00:00.000Z'))).toBe('2026-09-13');
  });

  it('acepta otra zona si se la pasan', () => {
    expect(dayKeyInTimeZone(new Date('2026-09-14T02:00:00.000Z'), 'UTC')).toBe('2026-09-14');
  });

  it('una fecha inválida devuelve cadena vacía', () => {
    expect(dayKeyInTimeZone(new Date('no-es-fecha'))).toBe('');
  });
});

describe('daysApartInTimeZone', () => {
  const ahora = new Date('2026-09-13T12:00:00.000Z');

  it('el mismo día son cero', () => {
    expect(daysApartInTimeZone(new Date('2026-09-13T20:00:00.000Z'), ahora)).toBe(0);
  });

  it('el día anterior es uno', () => {
    expect(daysApartInTimeZone(new Date('2026-09-12T20:00:00.000Z'), ahora)).toBe(1);
  });

  // Este es el caso que fallaba: 01:00 UTC del 13 es el 12 en Colombia,
  // así que para un usuario en Bogotá eso es "ayer", no "hoy".
  it('la madrugada UTC cuenta como el día anterior en Colombia', () => {
    expect(daysApartInTimeZone(new Date('2026-09-13T01:00:00.000Z'), ahora)).toBe(1);
  });

  it('el futuro da negativo', () => {
    expect(daysApartInTimeZone(new Date('2026-09-14T20:00:00.000Z'), ahora)).toBe(-1);
  });

  it('cruza el fin de mes sin equivocarse', () => {
    expect(daysApartInTimeZone(
      new Date('2026-08-31T20:00:00.000Z'),
      new Date('2026-09-01T20:00:00.000Z'),
    )).toBe(1);
  });

  it('una fecha inválida devuelve null', () => {
    expect(daysApartInTimeZone(new Date('no-es-fecha'), ahora)).toBeNull();
  });
});

describe('formatDayLabel', () => {
  const ahora = new Date('2026-09-13T12:00:00.000Z');

  it('hoy y ayer se dicen con palabras', () => {
    expect(formatDayLabel('2026-09-13T20:00:00.000Z', ahora)).toBe('Hoy');
    expect(formatDayLabel('2026-09-12T20:00:00.000Z', ahora)).toBe('Ayer');
  });

  it('la madrugada UTC de hoy sigue siendo ayer en Colombia', () => {
    expect(formatDayLabel('2026-09-13T01:00:00.000Z', ahora)).toBe('Ayer');
  });

  it('más atrás va con fecha corta', () => {
    expect(formatDayLabel('2026-09-01T20:00:00.000Z', ahora)).toMatch(/1/);
  });

  it('una fecha inválida da un guion, no "Invalid Date"', () => {
    expect(formatDayLabel('no-es-fecha', ahora)).toBe('—');
    expect(formatDayLabel('', ahora)).toBe('—');
  });
});
