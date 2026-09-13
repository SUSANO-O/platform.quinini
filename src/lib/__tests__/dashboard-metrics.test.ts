import { describe, it, expect } from 'vitest';
import {
  formatHourLabel,
  monthOverMonth,
  outcomeBreakdown,
  monthBarHeights,
  type DashboardSummary,
} from '@/lib/dashboard-metrics';

describe('formatHourLabel', () => {
  it('usa 12 AM para la medianoche y 12 PM para el mediodía', () => {
    expect(formatHourLabel(0)).toBe('12 AM');
    expect(formatHourLabel(12)).toBe('12 PM');
  });

  it('reparte mañana y tarde', () => {
    expect(formatHourLabel(9)).toBe('9 AM');
    expect(formatHourLabel(15)).toBe('3 PM');
    expect(formatHourLabel(23)).toBe('11 PM');
  });

  it('devuelve un guion cuando no hay hora', () => {
    expect(formatHourLabel(null)).toBe('—');
  });
});

describe('monthOverMonth', () => {
  it('compara el último mes contra el anterior', () => {
    const r = monthOverMonth([
      { month: '2026-07', sessions: 100 },
      { month: '2026-08', sessions: 125 },
    ]);
    expect(r).toEqual({ current: 125, previous: 100, deltaPct: 25, direction: 'up' });
  });

  it('marca la bajada', () => {
    const r = monthOverMonth([
      { month: '2026-07', sessions: 200 },
      { month: '2026-08', sessions: 150 },
    ]);
    expect(r?.direction).toBe('down');
    expect(r?.deltaPct).toBe(-25);
  });

  it('redondea a entero', () => {
    expect(monthOverMonth([
      { month: '2026-07', sessions: 3 },
      { month: '2026-08', sessions: 4 },
    ])?.deltaPct).toBe(33);
  });

  // Sin mes anterior no hay comparación honesta que mostrar.
  it('devuelve null con menos de dos meses', () => {
    expect(monthOverMonth([])).toBeNull();
    expect(monthOverMonth([{ month: '2026-08', sessions: 10 }])).toBeNull();
  });

  // Dividir por cero daría Infinity y se pintaría como "∞%".
  it('devuelve null si el mes anterior fue cero', () => {
    expect(monthOverMonth([
      { month: '2026-07', sessions: 0 },
      { month: '2026-08', sessions: 40 },
    ])).toBeNull();
  });

  it('reconoce que no cambió', () => {
    expect(monthOverMonth([
      { month: '2026-07', sessions: 50 },
      { month: '2026-08', sessions: 50 },
    ])).toEqual({ current: 50, previous: 50, deltaPct: 0, direction: 'flat' });
  });

  it('toma los dos últimos aunque lleguen más', () => {
    const r = monthOverMonth([
      { month: '2026-06', sessions: 1 },
      { month: '2026-07', sessions: 100 },
      { month: '2026-08', sessions: 110 },
    ]);
    expect(r?.previous).toBe(100);
    expect(r?.current).toBe(110);
  });
});

describe('outcomeBreakdown', () => {
  const summary: DashboardSummary = {
    totalSessions: 1000,
    avgMessagesPerSession: 4.6,
    escalationRate: 18,
    dropOffRate: 22,
    resolutionRate: 60,
  };

  it('devuelve las tres salidas en orden, con conteo derivado', () => {
    const rows = outcomeBreakdown(summary);
    expect(rows.map(r => r.key)).toEqual(['resolved', 'escalated', 'dropped']);
    expect(rows.map(r => r.pct)).toEqual([60, 18, 22]);
    expect(rows.map(r => r.count)).toEqual([600, 180, 220]);
  });

  it('cada salida trae su papel de color, no un hex suelto', () => {
    expect(outcomeBreakdown(summary).map(r => r.tone)).toEqual(['success', 'brand', 'warning']);
  });

  it('recorta porcentajes fuera de rango en vez de desbordar la barra', () => {
    const rows = outcomeBreakdown({ ...summary, resolutionRate: 140, dropOffRate: -5 });
    expect(rows[0].pct).toBe(100);
    expect(rows[2].pct).toBe(0);
  });

  it('sin sesiones, los conteos quedan en cero', () => {
    const rows = outcomeBreakdown({ ...summary, totalSessions: 0 });
    expect(rows.every(r => r.count === 0)).toBe(true);
  });
});

describe('monthBarHeights', () => {
  it('la barra más alta llega al 100%', () => {
    const bars = monthBarHeights([
      { month: '2026-07', sessions: 50 },
      { month: '2026-08', sessions: 100 },
    ]);
    expect(bars[1].heightPct).toBe(100);
    expect(bars[0].heightPct).toBe(50);
  });

  // Una barra de 0.4% no se ve; queda un hilo visible.
  it('da un mínimo visible a los meses flojos', () => {
    const bars = monthBarHeights([
      { month: '2026-07', sessions: 1 },
      { month: '2026-08', sessions: 1000 },
    ]);
    expect(bars[0].heightPct).toBe(6);
  });

  it('marca el último mes como el actual', () => {
    const bars = monthBarHeights([
      { month: '2026-07', sessions: 10 },
      { month: '2026-08', sessions: 20 },
    ]);
    expect(bars.map(b => b.isCurrent)).toEqual([false, true]);
  });

  it('acorta la etiqueta del mes', () => {
    expect(monthBarHeights([{ month: '2026-08', sessions: 5 }])[0].label).toBe('08');
  });

  it('con todo en cero no divide por cero', () => {
    const bars = monthBarHeights([
      { month: '2026-07', sessions: 0 },
      { month: '2026-08', sessions: 0 },
    ]);
    expect(bars.every(b => b.heightPct === 6)).toBe(true);
  });

  it('lista vacía devuelve lista vacía', () => {
    expect(monthBarHeights([])).toEqual([]);
  });
});
