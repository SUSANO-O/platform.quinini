/**
 * Trazas opcionales del flujo widget → hub → AIBackHub.
 * Activa en `.env`: `DEBUG_WIDGET_FLOW=1` (solo servidor; aparece en consola Vercel/local).
 */
export function logWidgetFlow(
  emoji: string,
  segment: string,
  detail: string,
  meta?: Record<string, unknown>,
): void {
  if (process.env.DEBUG_WIDGET_FLOW?.trim() !== '1') return;
  const extra = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  console.log(`${emoji} [widget-flow|landing|${segment}] ${detail}${extra}`);
}

/** Evita filtrar PII en logs: solo longitud y un prefijo corto. */
export function widgetMessageProbe(message: string | undefined): { len: number; head: string } {
  const m = typeof message === 'string' ? message : '';
  return {
    len: m.length,
    head: m.slice(0, 72).replace(/\s+/g, ' ').trim(),
  };
}
