/**
 * Estadísticas de latencia para baseline UX-0 (puro, sin I/O).
 */

export function percentile(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null;
  if (p <= 0) return sortedAsc[0]!;
  if (p >= 100) return sortedAsc[sortedAsc.length - 1]!;
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  const w = idx - lo;
  return sortedAsc[lo]! * (1 - w) + sortedAsc[hi]! * w;
}

export type LatencyStats = {
  sampleCount: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
};

export function computeLatencyStats(totalMsList: number[]): LatencyStats {
  const clean = totalMsList.filter((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  if (!clean.length) {
    return { sampleCount: 0, p50: null, p95: null, p99: null, avg: null, min: null, max: null };
  }
  const sorted = [...clean].sort((a, b) => a - b);
  const sum = sorted.reduce((s, n) => s + n, 0);
  return {
    sampleCount: sorted.length,
    p50: Math.round(percentile(sorted, 50)!),
    p95: Math.round(percentile(sorted, 95)!),
    p99: Math.round(percentile(sorted, 99)!),
    avg: Math.round(sum / sorted.length),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

/** UX-1: |new - base| / base * 100 ≤ pct. Si base=0, exige new≈0. */
export function withinRelativeBudget(
  baselineP95: number,
  newP95: number,
  pct: number,
): boolean {
  if (baselineP95 <= 0) return Math.abs(newP95) <= 1;
  return (Math.abs(newP95 - baselineP95) / baselineP95) * 100 <= pct;
}

/** UX-2: newP95 - baselineP95 ≤ deltaMs */
export function withinAbsoluteDelta(baselineP95: number, newP95: number, deltaMs: number): boolean {
  return newP95 - baselineP95 <= deltaMs;
}
