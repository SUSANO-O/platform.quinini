/**
 * Opciones y reglas puras del visor admin de Embeddings 3D (sin three.js, testeables).
 */

/** Opciones del selector "Límite de puntos". El hub acepta hasta 10 000 (VIZ_LIST_MAX). */
export const EMBEDDING_VIZ_LIMITS = [200, 500, 1000, 1500, 2500, 5000, 7500, 10_000] as const;

export const EMBEDDING_VIZ_DEFAULT_LIMIT = 500;

/**
 * Segmentos de cada esfera según cuántas hay: con miles, esferas más simples para no dibujar
 * millones de triángulos (a ese tamaño en pantalla no se nota la diferencia).
 */
export function sphereSegmentsFor(count: number): number {
  if (count > 6000) return 6;
  if (count > 3000) return 8;
  if (count > 1500) return 12;
  return 18;
}

/** "Información conservada en 3D" a partir de la varianza explicada; null si no hay dato válido. */
export function formatExplainedVariance(ev: unknown): string | null {
  if (!Array.isArray(ev) || ev.length === 0) return null;
  const nums = ev.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0);
  if (nums.length !== ev.length) return null;
  const total = nums.reduce((s, x) => s + x, 0);
  if (total <= 0 || total > 1.0001) return null;
  const pct = total * 100;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

/**
 * Selección de tipos en la leyenda. Conjunto vacío = se ven todos.
 * Clic en un tipo: si no estaba elegido, se añade (se ven solo los elegidos); si estaba, se quita.
 * Si al quitar queda vacío, se vuelve a ver todo.
 */
export function toggleTypeSelection(selected: ReadonlySet<string>, type: string): Set<string> {
  const next = new Set(selected);
  if (next.has(type)) next.delete(type);
  else next.add(type);
  return next;
}

/** ¿Se dibuja este tipo con la selección actual? */
export function isTypeVisible(selected: ReadonlySet<string>, type: string): boolean {
  return selected.size === 0 || selected.has(type);
}

/** Cuántos puntos quedan visibles con la selección. */
export function visibleCount(counts: Record<string, number>, selected: ReadonlySet<string>): number {
  return Object.entries(counts).reduce((s, [t, n]) => (isTypeVisible(selected, t) ? s + n : s), 0);
}
