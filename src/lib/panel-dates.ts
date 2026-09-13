/**
 * Fechas del panel, siempre en la zona del negocio.
 *
 * El resto del panel ya calcula en hora Colombia: la analítica de widgets
 * agrupa por `America/Bogota` (`/api/analytics/widget/[id]`), las tareas
 * programadas usan `DEFAULT_TIMEZONE` y las consolas de admin formatean con
 * `timeZone: 'America/Bogota'`. Las etiquetas de "hoy", "ayer" y "hace X",
 * en cambio, se calculaban con el reloj de quien mirara: en un servidor en
 * UTC —o para alguien fuera de Colombia— un mensaje de las 21:00 aparecía
 * como del día siguiente, y no cuadraba con las cifras de al lado.
 */

import { DEFAULT_TIMEZONE } from '@/lib/scheduling';

export const PANEL_TIMEZONE = DEFAULT_TIMEZONE;

/** Día civil (`YYYY-MM-DD`) que le corresponde a un instante en esa zona. */
export function dayKeyInTimeZone(date: Date, timeZone: string = PANEL_TIMEZONE): string {
  if (Number.isNaN(date.getTime())) return '';
  // `en-CA` da el formato ISO directamente, sin armar la cadena a mano.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Cuántos días civiles separan a `date` de `now` en esa zona. Positivo hacia
 * el pasado (ayer = 1), negativo hacia el futuro. `null` si alguna no es fecha.
 */
export function daysApartInTimeZone(
  date: Date,
  now: Date = new Date(),
  timeZone: string = PANEL_TIMEZONE,
): number | null {
  const a = dayKeyInTimeZone(date, timeZone);
  const b = dayKeyInTimeZone(now, timeZone);
  if (!a || !b) return null;

  // Comparando los días a mediodía UTC, el horario de verano no puede
  // desplazar la resta al día vecino.
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** "Hoy", "Ayer" o la fecha corta, medido en la zona del panel. */
export function formatDayLabel(
  iso: string,
  now: Date = new Date(),
  timeZone: string = PANEL_TIMEZONE,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';

  const dias = daysApartInTimeZone(d, now, timeZone);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';

  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone });
}
