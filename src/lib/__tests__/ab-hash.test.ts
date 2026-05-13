import { describe, it, expect } from 'vitest';

/**
 * Tests for the A/B deterministic hash algorithm used in ab-testing.ts.
 * We test the hash logic in isolation without the DB dependency.
 */

function hashSessionId(sessionId: string): number {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

function selectVariant(variants: { trafficPct: number; id: string }[], bucket: number) {
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.trafficPct;
    if (bucket < cumulative) return v;
  }
  return variants[variants.length - 1];
}

describe('A/B hash bucket distribution', () => {
  it('produces a bucket in range 0-99', () => {
    const sessionIds = ['abc', '123', 'session-xyz', '', 'a'];
    for (const id of sessionIds) {
      const b = hashSessionId(id);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });

  it('is deterministic for the same sessionId', () => {
    const id = 'stable-session-id-12345';
    const b1 = hashSessionId(id);
    const b2 = hashSessionId(id);
    expect(b1).toBe(b2);
  });

  it('different sessionIds produce different buckets (usually)', () => {
    const buckets = new Set<number>();
    for (let i = 0; i < 50; i++) {
      buckets.add(hashSessionId(`session-${i}`));
    }
    // With 50 different sessions, we expect at least 20 distinct buckets
    expect(buckets.size).toBeGreaterThan(20);
  });

  it('distributes roughly evenly across 1000 sessions', () => {
    const counts = Array(10).fill(0); // 10 buckets of 10% each
    for (let i = 0; i < 1000; i++) {
      const b = hashSessionId(`load-test-session-${i}`);
      counts[Math.floor(b / 10)]++;
    }
    // Each decile should have roughly 100 sessions; allow 50% variance
    for (const c of counts) {
      expect(c).toBeGreaterThan(50);
      expect(c).toBeLessThan(150);
    }
  });

  describe('variant selection', () => {
    const variants50_50 = [
      { id: 'control', trafficPct: 50 },
      { id: 'treatment', trafficPct: 50 },
    ];

    it('selects control for bucket < 50', () => {
      expect(selectVariant(variants50_50, 0).id).toBe('control');
      expect(selectVariant(variants50_50, 49).id).toBe('control');
    });

    it('selects treatment for bucket >= 50', () => {
      expect(selectVariant(variants50_50, 50).id).toBe('treatment');
      expect(selectVariant(variants50_50, 99).id).toBe('treatment');
    });

    it('handles 3-way split (33/33/34)', () => {
      const v = [
        { id: 'a', trafficPct: 33 },
        { id: 'b', trafficPct: 33 },
        { id: 'c', trafficPct: 34 },
      ];
      expect(selectVariant(v, 0).id).toBe('a');
      expect(selectVariant(v, 32).id).toBe('a');
      expect(selectVariant(v, 33).id).toBe('b');
      expect(selectVariant(v, 65).id).toBe('b');
      expect(selectVariant(v, 66).id).toBe('c');
      expect(selectVariant(v, 99).id).toBe('c');
    });

    it('falls back to last variant when sum < 100', () => {
      // Defensive: if percentages don't sum to 100, last variant catches overflow
      const v = [
        { id: 'only', trafficPct: 80 },
      ];
      expect(selectVariant(v, 99).id).toBe('only');
    });

    it('same session always maps to same variant', () => {
      const sessionId = 'consistent-session-abc';
      const bucket = hashSessionId(sessionId);
      const v1 = selectVariant(variants50_50, bucket);
      const v2 = selectVariant(variants50_50, bucket);
      expect(v1.id).toBe(v2.id);
    });
  });
});
