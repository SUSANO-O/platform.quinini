/**
 * Identificador estable del visitante del widget (localStorage en el navegador).
 * Permite memoria episódica entre sesiones de chat (misma pestaña u otra visita).
 */

const VISITOR_PREFIX = 'vis_';

export function normalizeVisitorId(raw: unknown): string | null {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return null;
  if (!/^vis_[a-zA-Z0-9_-]{8,120}$/.test(v)) return null;
  return v;
}

export function createVisitorId(): string {
  return `${VISITOR_PREFIX}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

export function visitorMemoryTag(visitorId: string): string {
  return `widget-visitor:${visitorId.trim()}`;
}

export function sessionMemoryTag(sessionId: string): string {
  return `widget-session:${sessionId.trim()}`;
}
