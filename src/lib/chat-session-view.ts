/**
 * Etiquetas de la pantalla de chats.
 *
 * Estaban dentro del componente de la página, sin pruebas y repitiendo lo que
 * ya hacía la tarjeta del inbox con otro criterio: allí un mensaje de anoche
 * decía "ayer" y aquí "hace 1 d".
 */

import { daysApartInTimeZone } from '@/lib/panel-dates';

export type SentimentTone = 'success' | 'danger';

/** Antigüedad en palabras; el día se mide en la zona del panel. */
export function timeAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const seg = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (seg < 60) return 'ahora';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;

  const dias = daysApartInTimeZone(d, now);
  if (dias === 0) return `hace ${Math.max(1, Math.floor(seg / 3600))} h`;
  if (dias === 1) return 'ayer';
  return `hace ${dias} d`;
}

/** Duración de la sesión. Una negativa vendría de relojes desfasados. */
export function formatDuration(sec: number | null): string {
  if (sec === null || sec < 0) return '—';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

/** Solo se marca lo que se sale de lo normal: neutro no lleva etiqueta. */
export function sentimentTag(sentiment: string): { label: string; tone: SentimentTone } | null {
  if (sentiment === 'positive') return { label: 'Positivo', tone: 'success' };
  if (sentiment === 'negative') return { label: 'Negativo', tone: 'danger' };
  return null;
}
