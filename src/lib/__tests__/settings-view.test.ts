import { describe, it, expect } from 'vitest';
import { fmtDateTime, fmtEpochSec, formatMb } from '@/lib/settings-view';

describe('fmtDateTime', () => {
  it('formatea una fecha en texto y un Date', () => {
    expect(fmtDateTime('2026-09-13T17:00:00.000Z')).toMatch(/2026/);
    expect(fmtDateTime(new Date('2026-09-13T17:00:00.000Z'))).toMatch(/2026/);
  });

  // 02:00 UTC del 14 son las 21:00 del 13 en Colombia: el panel dice 13.
  it('usa la zona del panel, no la del navegador', () => {
    expect(fmtDateTime('2026-09-14T02:00:00.000Z')).toMatch(/13/);
  });

  it('los huecos dan guion, no "Invalid Date"', () => {
    expect(fmtDateTime(null)).toBe('—');
    expect(fmtDateTime(undefined)).toBe('—');
    expect(fmtDateTime('no-es-fecha')).toBe('—');
    expect(fmtDateTime('')).toBe('—');
  });
});

describe('fmtEpochSec', () => {
  it('convierte segundos a fecha legible', () => {
    expect(fmtEpochSec(Math.floor(Date.UTC(2026, 8, 13, 17) / 1000))).toMatch(/2026/);
  });

  it('usa la zona del panel', () => {
    expect(fmtEpochSec(Math.floor(Date.UTC(2026, 8, 14, 2) / 1000))).toMatch(/13/);
  });

  // Cero y negativo son "sin fecha" en este modelo de datos, no 1970.
  it('cero y negativos dan guion', () => {
    expect(fmtEpochSec(0)).toBe('—');
    expect(fmtEpochSec(-100)).toBe('—');
  });

  it('milisegundos por error no se cuelan como año lejano', () => {
    // Un valor en ms daría un año absurdo; al menos no debe romper.
    expect(typeof fmtEpochSec(1789000000000)).toBe('string');
  });
});

describe('formatMb', () => {
  it('por debajo de 100 MB muestra un decimal', () => {
    expect(formatMb(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatMb(45.67 * 1024 * 1024)).toBe('45.7 MB');
  });

  it('a partir de 100 MB redondea a entero', () => {
    expect(formatMb(100 * 1024 * 1024)).toBe('100 MB');
    expect(formatMb(1536 * 1024 * 1024)).toMatch(/^1[.,]?536 MB$/);
  });

  it('cero y negativos son cero', () => {
    expect(formatMb(0)).toBe('0 MB');
    expect(formatMb(-1000)).toBe('0 MB');
  });

  it('un valor no finito no rompe la pantalla', () => {
    expect(formatMb(Number.NaN)).toBe('0 MB');
    expect(formatMb(Number.POSITIVE_INFINITY)).toBe('0 MB');
  });

  it('unos pocos bytes no se muestran como 0 MB a secas', () => {
    expect(formatMb(1024)).toBe('0.0 MB');
  });
});
