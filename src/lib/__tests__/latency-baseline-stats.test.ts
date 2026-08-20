import { describe, expect, it } from 'vitest';
import {
  computeLatencyStats,
  percentile,
  withinAbsoluteDelta,
  withinRelativeBudget,
} from '../latency-baseline-stats';

describe('percentile', () => {
  it('lista vacía → null', () => {
    expect(percentile([], 50)).toBeNull();
  });

  it('un elemento', () => {
    expect(percentile([100], 95)).toBe(100);
  });

  it('p50 de serie impar', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });
});

describe('computeLatencyStats', () => {
  it('ignora no finitos', () => {
    const s = computeLatencyStats([100, NaN, -1, 200, Infinity as unknown as number]);
    // -1 filtered (>=0), NaN/Infinity filtered
    expect(s.sampleCount).toBe(2);
    expect(s.p50).toBe(150);
  });

  it('calcula p95 en muestra grande', () => {
    const list = Array.from({ length: 100 }, (_, i) => i + 1);
    const s = computeLatencyStats(list);
    expect(s.sampleCount).toBe(100);
    expect(s.min).toBe(1);
    expect(s.max).toBe(100);
    expect(s.p95).toBeGreaterThanOrEqual(95);
    expect(s.p95).toBeLessThanOrEqual(100);
  });
});

describe('budgets UX', () => {
  it('UX-1 ±5% relativo', () => {
    expect(withinRelativeBudget(10000, 10400, 5)).toBe(true);
    expect(withinRelativeBudget(10000, 11000, 5)).toBe(false);
  });

  it('UX-2 +200 ms absoluto', () => {
    expect(withinAbsoluteDelta(10000, 10150, 200)).toBe(true);
    expect(withinAbsoluteDelta(10000, 10300, 200)).toBe(false);
  });
});
