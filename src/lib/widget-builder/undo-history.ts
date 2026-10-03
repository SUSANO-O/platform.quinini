/**
 * Deshacer / rehacer del estudio del widget. Puro e inmutable (fácil de probar).
 * Los cambios seguidos en menos de `groupMs` (arrastrar un deslizador, teclear un color) se agrupan
 * en un solo paso, para que deshacer no vaya de píxel en píxel.
 */

export type UndoHistory<T> = { past: T[]; future: T[]; lastAt: number };

export const UNDO_LIMIT = 60;

export function emptyHistory<T>(): UndoHistory<T> {
  return { past: [], future: [], lastAt: 0 };
}

/** Registrar el estado ANTERIOR a un cambio. */
export function recordChange<T>(h: UndoHistory<T>, before: T, now: number, groupMs = 700): UndoHistory<T> {
  if (now - h.lastAt < groupMs && h.past.length) return { ...h, future: [], lastAt: now };
  return { past: [...h.past, before].slice(-UNDO_LIMIT), future: [], lastAt: now };
}

export function undo<T>(h: UndoHistory<T>, current: T): { history: UndoHistory<T>; state: T } | null {
  if (!h.past.length) return null;
  const state = h.past[h.past.length - 1];
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future], lastAt: 0 }, state };
}

export function redo<T>(h: UndoHistory<T>, current: T): { history: UndoHistory<T>; state: T } | null {
  if (!h.future.length) return null;
  const [state, ...rest] = h.future;
  return { history: { past: [...h.past, current].slice(-UNDO_LIMIT), future: rest, lastAt: 0 }, state };
}
