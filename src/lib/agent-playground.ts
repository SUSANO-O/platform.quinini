/** Saneado de la entrada del panel "Probar el agente" (ruta /api/agents/[id]/playground). */

const CLAIM_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

export function sanitizePlaygroundIdentity(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!CLAIM_RE.test(k) || typeof v !== 'string' || !v.trim()) continue;
    out[k] = v.trim().slice(0, 120);
    if (Object.keys(out).length >= 10) break;
  }
  return Object.keys(out).length ? out : undefined;
}

export function sanitizePlaygroundHistory(raw: unknown): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h): h is { role: string; content: string } => !!h && typeof h === 'object' && typeof (h as { content?: unknown }).content === 'string')
    .map((h) => ({ role: h.role === 'user' ? ('user' as const) : ('assistant' as const), content: h.content.slice(0, 4000) }))
    .slice(-20);
}
