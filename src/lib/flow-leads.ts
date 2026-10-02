/**
 * Leads de flujos conversacionales: cuando un flujo con "genera leads" termina, se arma el lead
 * a partir de las respuestas (nombre/email/teléfono por el TIPO de nodo, no adivinando texto) y se
 * entrega por el webhook SaaS de la cuenta (`flow.lead_captured`). Ver record/route.ts.
 */

export type FlowAnswer = { nodeId: string; key: string; value: string; label?: string };
export type FlowLeadField = { key: string; question: string; value: string };
export type FlowLead = { name?: string; email?: string; phone?: string; fields: FlowLeadField[] };
export type FlowSource = { pagePath: string; utm: Record<string, string> };

type FlowNodeLike = { id?: unknown; type?: unknown; question?: unknown; config?: unknown };

const MAX_ANSWERS = 100;
const MAX_VALUE = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_HINT_RE = /\b(nombre|name|ll[aá]mas)\b/i;

function str(v: unknown, max: number): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '';
}

/** Respuestas tal como llegan del navegador → forma acotada y segura para guardar. */
export function sanitizeFlowAnswers(raw: unknown): FlowAnswer[] {
  if (!Array.isArray(raw)) return [];
  const out: FlowAnswer[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const o = a as Record<string, unknown>;
    const nodeId = str(o.nodeId, 100);
    if (!nodeId) continue;
    const label = str(o.label, MAX_VALUE);
    out.push({ nodeId, key: str(o.key, 100) || nodeId, value: str(o.value, MAX_VALUE), ...(label ? { label } : {}) });
    if (out.length >= MAX_ANSWERS) break;
  }
  return out;
}

/** Lead a partir del flujo y sus respuestas; null si no hay forma de contactar (ni email ni teléfono). */
export function extractFlowLead(nodes: FlowNodeLike[], rawAnswers: unknown): FlowLead | null {
  const answers = sanitizeFlowAnswers(rawAnswers);
  const byId = new Map<string, FlowNodeLike>();
  for (const n of Array.isArray(nodes) ? nodes : []) if (typeof n?.id === 'string') byId.set(n.id, n);

  // La última respuesta de cada nodo gana (el visitante pudo corregir o el flujo volver atrás).
  const last = new Map<string, FlowAnswer>();
  for (const a of answers) if (byId.has(a.nodeId)) { last.delete(a.nodeId); last.set(a.nodeId, a); }

  const lead: FlowLead = { fields: [] };
  for (const a of last.values()) {
    const node = byId.get(a.nodeId)!;
    const type = String(node.type ?? '');
    const question = str(node.question, 300);
    const shown = a.label || a.value;
    if (!shown) continue;
    lead.fields.push({ key: a.key, question, value: shown });

    if (type === 'email' && EMAIL_RE.test(a.value)) lead.email = a.value.toLowerCase();
    else if (type === 'phone' && a.value.replace(/\D/g, '').length >= 7) lead.phone = a.value;
    else if (type === 'text' && !lead.name) {
      const cfg = (node.config ?? {}) as Record<string, unknown>;
      if (NAME_HINT_RE.test(String(cfg.variableKey ?? '')) || NAME_HINT_RE.test(question)) lead.name = a.value;
    }
  }
  return lead.email || lead.phone ? lead : null;
}

/** De la URL donde corrió el flujo: solo la ruta y parámetros utm_* (atribución), nada más. */
export function sanitizeFlowSource(raw: unknown): FlowSource | null {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!/^https?:\/\//i.test(v)) return null;
  try {
    const u = new URL(v);
    const utm: Record<string, string> = {};
    [...u.searchParams.keys()].sort().forEach((k) => {
      if (/^utm_[a-z_]{1,20}$/i.test(k)) utm[k.toLowerCase()] = str(u.searchParams.get(k), 120);
    });
    return { pagePath: u.pathname.slice(0, 300), utm };
  } catch {
    return null;
  }
}
