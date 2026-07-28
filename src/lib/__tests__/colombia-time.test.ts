import { describe, expect, it } from 'vitest';
import { findPeakHour } from '../colombia-time';

describe('findPeakHour', () => {
  it('devuelve null si no hay tráfico', () => {
    expect(findPeakHour(new Array(24).fill(0))).toBeNull();
  });

  it('en empate elige la hora más tardía', () => {
    const buckets = new Array(24).fill(0);
    buckets[9] = 5;
    buckets[15] = 5;
    expect(findPeakHour(buckets)).toBe(15);
  });

  it('elige la hora con más mensajes', () => {
    const buckets = new Array(24).fill(0);
    buckets[14] = 12;
    buckets[3] = 2;
    expect(findPeakHour(buckets)).toBe(14);
  });
});
