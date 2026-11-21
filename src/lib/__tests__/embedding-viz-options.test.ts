import { describe, expect, it } from 'vitest';
import {
  EMBEDDING_VIZ_DEFAULT_LIMIT,
  EMBEDDING_VIZ_LIMITS,
  formatExplainedVariance,
  sphereSegmentsFor,
} from '../embedding-viz-options';

describe('opciones del visor de embeddings 3D', () => {
  it('ofrece muchos más puntos, ordenados, hasta el tope del hub (10 000)', () => {
    expect([...EMBEDDING_VIZ_LIMITS]).toEqual([...EMBEDDING_VIZ_LIMITS].sort((a, b) => a - b));
    expect(Math.max(...EMBEDDING_VIZ_LIMITS)).toBe(10_000);
    expect(EMBEDDING_VIZ_LIMITS).toContain(5000);
    expect(EMBEDDING_VIZ_LIMITS).toContain(EMBEDDING_VIZ_DEFAULT_LIMIT);
  });

  it('con más puntos usa esferas más simples', () => {
    expect(sphereSegmentsFor(500)).toBe(18);
    expect(sphereSegmentsFor(2500)).toBeLessThan(18);
    expect(sphereSegmentsFor(10_000)).toBeLessThan(sphereSegmentsFor(2500));
    expect(sphereSegmentsFor(10_000)).toBeGreaterThanOrEqual(6);
  });

  it('formatea la información conservada en 3D y descarta datos raros', () => {
    expect(formatExplainedVariance([0.041, 0.04, 0.039])).toBe('12%');
    expect(formatExplainedVariance([0.02, 0.01, 0.01])).toBe('4.0%');
    expect(formatExplainedVariance(undefined)).toBeNull();
    expect(formatExplainedVariance([0, 0, 0])).toBeNull();
    expect(formatExplainedVariance([0.5, 'x', 0.1])).toBeNull();
    expect(formatExplainedVariance([0.9, 0.5, 0.1])).toBeNull();
  });
});
