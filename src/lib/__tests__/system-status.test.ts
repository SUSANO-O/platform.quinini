import { describe, it, expect } from 'vitest';
import { resolveSystemStatus, poolPressure } from '@/lib/system-status';

describe('resolveSystemStatus', () => {
  it('operativo', () => {
    expect(resolveSystemStatus('operational')).toEqual({ label: 'Todo operativo', tone: 'success' });
  });

  it('degradado', () => {
    expect(resolveSystemStatus('degraded')).toEqual({ label: 'Degradado', tone: 'warning' });
  });

  it('caído', () => {
    expect(resolveSystemStatus('down')).toEqual({ label: 'Caído', tone: 'danger' });
  });

  // Mientras no llega la respuesta no hay que alarmar con rojo.
  it('sin dato todavía queda neutro', () => {
    expect(resolveSystemStatus(null)).toEqual({ label: 'Comprobando…', tone: 'neutral' });
    expect(resolveSystemStatus(undefined)).toEqual({ label: 'Comprobando…', tone: 'neutral' });
  });

  it('un estado desconocido no se inventa un color de alarma', () => {
    expect(resolveSystemStatus('vacaciones')).toEqual({ label: 'Comprobando…', tone: 'neutral' });
  });
});

describe('poolPressure', () => {
  it('por debajo del 80% no hay aviso', () => {
    expect(poolPressure({ percentUsed: 42, limit: 1000 })).toBe('neutral');
    expect(poolPressure({ percentUsed: 79.9, limit: 1000 })).toBe('neutral');
  });

  it('del 80 al 95 avisa', () => {
    expect(poolPressure({ percentUsed: 80, limit: 1000 })).toBe('warning');
    expect(poolPressure({ percentUsed: 94, limit: 1000 })).toBe('warning');
  });

  it('del 95 en adelante es urgente', () => {
    expect(poolPressure({ percentUsed: 95, limit: 1000 })).toBe('danger');
    expect(poolPressure({ percentUsed: 140, limit: 1000 })).toBe('danger');
  });

  // `-1` es el cupo ilimitado en este modelo de datos: nunca hay presión.
  it('el cupo ilimitado nunca aprieta', () => {
    expect(poolPressure({ percentUsed: 400, limit: -1 })).toBe('neutral');
  });

  it('sin datos del pool, neutro', () => {
    expect(poolPressure(null)).toBe('neutral');
  });
});
