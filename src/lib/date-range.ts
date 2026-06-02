/**
 * Utilidades de rango de fechas en TZ Colombia (UTC-5, sin DST).
 *
 * Las apps de dashboard guardan timestamps en UTC pero el usuario espera
 * ver datos agrupados/filtrados por SU día/mes (Colombia). Estas funciones
 * computan los límites correctos.
 */

export const COLOMBIA_OFFSET_MS = 5 * 60 * 60 * 1000;

export type RangePreset =
  | 'today'
  | 'last_7d'
  | 'last_30d'
  | 'last_90d'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface DateRange {
  from: Date;
  to: Date;
  preset: RangePreset;
  label: string;
}

/** Inicio del día de hoy en Colombia, expresado como instante UTC. */
function startOfColombiaToday(): Date {
  const nowUtc = Date.now();
  const nowCo = new Date(nowUtc - COLOMBIA_OFFSET_MS);
  // 00:00 Colombia = (00:00 - (-5h)) UTC = 05:00 UTC del mismo día
  const y = nowCo.getUTCFullYear();
  const m = nowCo.getUTCMonth();
  const d = nowCo.getUTCDate();
  return new Date(Date.UTC(y, m, d) + COLOMBIA_OFFSET_MS);
}

function startOfColombiaMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1) + COLOMBIA_OFFSET_MS);
}

/** Devuelve el rango canónico para un preset dado, en TZ Colombia. */
export function resolveRange(preset: RangePreset, customFrom?: string, customTo?: string): DateRange {
  const now = new Date();
  const startToday = startOfColombiaToday();

  switch (preset) {
    case 'today':
      return { from: startToday, to: now, preset, label: 'Hoy' };
    case 'last_7d':
      return { from: new Date(startToday.getTime() - 6 * 86_400_000), to: now, preset, label: 'Últimos 7 días' };
    case 'last_30d':
      return { from: new Date(startToday.getTime() - 29 * 86_400_000), to: now, preset, label: 'Últimos 30 días' };
    case 'last_90d':
      return { from: new Date(startToday.getTime() - 89 * 86_400_000), to: now, preset, label: 'Últimos 90 días' };
    case 'this_month': {
      const nowCo = new Date(now.getTime() - COLOMBIA_OFFSET_MS);
      const start = startOfColombiaMonth(nowCo.getUTCFullYear(), nowCo.getUTCMonth());
      return { from: start, to: now, preset, label: 'Este mes' };
    }
    case 'last_month': {
      const nowCo = new Date(now.getTime() - COLOMBIA_OFFSET_MS);
      const start = startOfColombiaMonth(nowCo.getUTCFullYear(), nowCo.getUTCMonth() - 1);
      const end = startOfColombiaMonth(nowCo.getUTCFullYear(), nowCo.getUTCMonth());
      return { from: start, to: end, preset, label: 'Mes anterior' };
    }
    case 'custom': {
      const from = customFrom ? parseLocalDate(customFrom) : new Date(startToday.getTime() - 29 * 86_400_000);
      const to   = customTo   ? endOfLocalDay(customTo) : now;
      return { from, to, preset, label: `${customFrom || ''} – ${customTo || ''}` };
    }
  }
}

/** "YYYY-MM-DD" → 00:00 Colombia UTC. */
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return new Date(0);
  return new Date(Date.UTC(y, m - 1, d) + COLOMBIA_OFFSET_MS);
}

/** "YYYY-MM-DD" → 23:59:59 Colombia UTC. */
function endOfLocalDay(s: string): Date {
  const start = parseLocalDate(s);
  return new Date(start.getTime() + 86_400_000 - 1);
}

/** Convierte un Date a string "YYYY-MM-DD" en TZ Colombia. Útil para <input type="date">. */
export function toColombiaDateInput(d: Date): string {
  const shifted = new Date(d.getTime() - COLOMBIA_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

/** Hora 0-23 en TZ Colombia. */
export function colombiaHour(d: Date): number {
  return new Date(d.getTime() - COLOMBIA_OFFSET_MS).getUTCHours();
}

/** Mes "YYYY-MM" en TZ Colombia. */
export function colombiaMonthKey(d: Date): string {
  const s = new Date(d.getTime() - COLOMBIA_OFFSET_MS);
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Lista de meses ['YYYY-MM'] cubiertos por un rango (de más reciente a más antiguo). */
export function monthsInRange(from: Date, to: Date): string[] {
  const result: string[] = [];
  const fromCo = new Date(from.getTime() - COLOMBIA_OFFSET_MS);
  const toCo = new Date(to.getTime() - COLOMBIA_OFFSET_MS);
  let y = toCo.getUTCFullYear();
  let m = toCo.getUTCMonth();
  while (y > fromCo.getUTCFullYear() || (y === fromCo.getUTCFullYear() && m >= fromCo.getUTCMonth())) {
    result.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m--;
    if (m < 0) { m = 11; y--; }
  }
  return result;
}
