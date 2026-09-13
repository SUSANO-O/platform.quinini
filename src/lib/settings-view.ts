/**
 * Formateo de la pantalla de ajustes.
 *
 * Estaba al final de `settings/page.tsx`, sin pruebas, y las dos funciones de
 * fecha no fijaban zona horaria: mostraban el reloj de quien mirara, mientras
 * el resto del panel trabaja en hora Colombia.
 */

import { PANEL_TIMEZONE } from '@/lib/panel-dates';

const FORMATO_LARGO = {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: PANEL_TIMEZONE,
} as const;

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (d == null || d === '') return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleString('es', FORMATO_LARGO);
}

/** Segundos desde la época. Cero o negativo significan "sin fecha", no 1970. */
export function fmtEpochSec(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const x = new Date(sec * 1000);
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleString('es', FORMATO_LARGO);
}

/** Tamaño en MB: un decimal hasta 100 MB, entero a partir de ahí. */
export function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (!Number.isFinite(mb) || mb <= 0) return '0 MB';
  if (mb >= 100) return `${Math.round(mb).toLocaleString('es')} MB`;
  return `${mb.toFixed(1)} MB`;
}
