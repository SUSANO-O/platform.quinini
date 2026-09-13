/**
 * Estado del sistema y presión de los cupos, como decisiones separadas del
 * dibujo.
 *
 * Vivían como cadenas de ternarios dentro de `dashboard-home-overview.tsx`,
 * mezclando la etiqueta con el color en hex. Aquí se devuelve el *papel* del
 * color y la pantalla decide con qué tono lo pinta — el mismo criterio que en
 * `dashboard-metrics`.
 */

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

export type SystemStatusView = { label: string; tone: StatusTone };

/**
 * Mientras no hay respuesta —o si llega un estado que no conocemos— se queda
 * neutro: alarmar con rojo por no saber es peor que no decir nada.
 */
export function resolveSystemStatus(status: string | null | undefined): SystemStatusView {
  switch (status) {
    case 'operational':
      return { label: 'Todo operativo', tone: 'success' };
    case 'degraded':
      return { label: 'Degradado', tone: 'warning' };
    case 'down':
      return { label: 'Caído', tone: 'danger' };
    default:
      return { label: 'Comprobando…', tone: 'neutral' };
  }
}

export const POOL_WARNING_PCT = 80;
export const POOL_DANGER_PCT = 95;

/** `limit === -1` es el cupo ilimitado de este modelo de datos. */
export function poolPressure(
  pool: { percentUsed: number; limit: number } | null | undefined,
): StatusTone {
  if (!pool || pool.limit === -1) return 'neutral';
  if (pool.percentUsed >= POOL_DANGER_PCT) return 'danger';
  if (pool.percentUsed >= POOL_WARNING_PCT) return 'warning';
  return 'neutral';
}
