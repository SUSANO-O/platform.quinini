import { describe, expect, it } from 'vitest';
import { getCuratedMemoryLimit, PLAN_CURATED_MEMORY_LIMITS } from '@/lib/plan-catalog';

describe('getCuratedMemoryLimit', () => {
  it('devuelve el límite configurado para cada plan', () => {
    for (const [plan, limit] of Object.entries(PLAN_CURATED_MEMORY_LIMITS)) {
      expect(getCuratedMemoryLimit(plan)).toBe(limit);
    }
  });

  it('enterprise es ilimitado (-1)', () => {
    expect(getCuratedMemoryLimit('enterprise')).toBe(-1);
  });

  it('plan desconocido cae al límite de free', () => {
    expect(getCuratedMemoryLimit('plan-que-no-existe')).toBe(PLAN_CURATED_MEMORY_LIMITS.free);
  });
});
