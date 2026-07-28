/** Utilidades de zona horaria Colombia (UTC-5, sin DST). */

export const COLOMBIA_OFFSET_MS = 5 * 60 * 60 * 1000;

export function colombiaDateKey(d = new Date()): string {
  const shifted = new Date(d.getTime() - COLOMBIA_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

/** Hora 0-23 en Colombia. */
export function colombiaHour(d: Date): number {
  return new Date(d.getTime() - COLOMBIA_OFFSET_MS).getUTCHours();
}

export function colombiaMonthKey(d: Date): string {
  const shifted = new Date(d.getTime() - COLOMBIA_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Inicio del mes calendario Colombia (00:00 UTC-5). */
export function colombiaMonthStart(d = new Date()): Date {
  const key = colombiaMonthKey(d);
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 5, 0, 0, 0));
}

/** Hora con más tráfico; en empate elige la más tardía del día. */
export function findPeakHour(hourBuckets: number[]): number | null {
  const max = Math.max(...hourBuckets);
  if (max <= 0) return null;
  for (let h = 23; h >= 0; h--) {
    if (hourBuckets[h] === max) return h;
  }
  return null;
}

export function formatHourColombia(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

/** Etiqueta 24h para UI (ej. 15:00). */
export function formatHourColombia24(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}
