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

/** Señales rápidas de calidad de respuesta inventario (stress tests y DEBUG_WIDGET_FLOW). */
export function widgetInventoryReplyProbe(reply: string | undefined): {
  repRefs: number;
  mentionsStock: boolean;
  mentionsSede: boolean;
  emptyInventory: boolean;
  asksLead: boolean;
} {
  const r = typeof reply === 'string' ? reply : '';
  const repRefs = (r.match(/\bREP-\d+/gi) ?? []).length;
  return {
    repRefs,
    mentionsStock: /\bstock\b/i.test(r),
    mentionsSede: /\bsede\b/i.test(r),
    emptyInventory: /(no (he |pude |encontr|hay)|sin resultados|no arroj[oó]|inventario vac)/i.test(r),
    asksLead: /(nombre|tel[eé]fono|correo|agendar|cita|especialista de producto|d[eé]jame tus datos)/i.test(r),
  };
}

/** Resumen compacto de herramientas usadas en una respuesta widget. */
export function widgetToolsProbe(toolsUsed: string[] | undefined): {
  count: number;
  sheetTools: string[];
  hasSheet: boolean;
} {
  const list = Array.isArray(toolsUsed) ? toolsUsed.map(String) : [];
  const sheetTools = list.filter((t) => /sheet/i.test(t));
  return { count: list.length, sheetTools, hasSheet: sheetTools.length > 0 };
}
