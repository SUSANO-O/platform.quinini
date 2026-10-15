/**
 * Auditor de agentes — arma el cuerpo para AIBackHub `/api/ai-assist/audit-agent`.
 *
 * Privacidad: los emails y teléfonos de los visitantes se ocultan ANTES de salir de la
 * landing. Se excluye la sonda horaria (`hourly_*`) y las conversaciones sin mensajes del cliente.
 */

import { baseSystemPrompt } from '@/lib/agent-managed-prompt';

export const AUDIT_CONVERSATION_LIMIT = 100;
/** Mensajes a leer como máximo para armar las conversaciones (las más recientes). */
export const AUDIT_MESSAGE_SCAN_LIMIT = 4000;
/** Ventana por defecto: lo de hace más de 90 días ya no describe al agente actual. */
export const AUDIT_WINDOW_DAYS = 90;

export type AuditAgentDoc = {
  name?: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
  agentFaqs?: Array<{ question?: unknown; answer?: unknown }>;
  behaviorRules?: Array<{ title?: unknown; interpretedRule?: unknown; description?: unknown; enabled?: unknown }>;
  skills?: string[];
  enabledMcpToolIds?: string[];
  ragSources?: Array<{ name?: unknown; fileName?: unknown; type?: unknown }>;
  updatedAt?: Date | string;
};

export type AuditMessageRow = {
  sessionId?: string;
  role?: string;
  content?: string;
  createdAt?: Date | string;
};

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** 7+ dígitos con separadores habituales (móviles CO, fijos, internacionales). */
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;

export function redactPii(text: string): string {
  return text.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[teléfono]');
}

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function iso(v: Date | string | undefined): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Agrupa mensajes (en cualquier orden) en conversaciones, de la más antigua a la más reciente. */
export function groupConversations(rows: AuditMessageRow[], limit = AUDIT_CONVERSATION_LIMIT) {
  const sorted = [...rows].sort((a, b) => iso(a.createdAt).localeCompare(iso(b.createdAt)));
  const bySession = new Map<string, AuditMessageRow[]>();
  for (const m of sorted) {
    const sid = s(m.sessionId);
    if (!sid || sid.startsWith('hourly_')) continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const list = bySession.get(sid) ?? [];
    list.push(m);
    bySession.set(sid, list);
  }
  return [...bySession.values()]
    .filter((ms) => ms.some((m) => m.role === 'user' && s(m.content)))
    .slice(-limit)
    .map((ms, i) => ({
      id: `c${i + 1}`,
      startedAt: iso(ms[0]?.createdAt),
      messages: ms
        .filter((m) => s(m.content))
        .slice(-40)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: redactPii(s(m.content)) })),
    }));
}

export function buildAgentAuditBody(agent: AuditAgentDoc, rows: AuditMessageRow[]) {
  return {
    agent: {
      name: (s(agent.name) || 'Agente').slice(0, 200),
      description: s(agent.description).slice(0, 2000),
      // Solo el prompt base: reglas y FAQ van aparte (si no, el auditor las vería duplicadas).
      systemPrompt: baseSystemPrompt(s(agent.systemPrompt)).slice(0, 60_000),
      model: s(agent.model).slice(0, 120),
      configUpdatedAt: iso(agent.updatedAt),
      faqs: (agent.agentFaqs ?? [])
        .map((f) => ({ question: s(f?.question).slice(0, 1000), answer: s(f?.answer).slice(0, 4000) }))
        .filter((f) => f.question && f.answer)
        .slice(0, 300),
      rules: (agent.behaviorRules ?? [])
        .filter((r) => r?.enabled !== false)
        .map((r) => ({ title: s(r?.title), description: s(r?.interpretedRule) || s(r?.description) }))
        .filter((r) => r.title || r.description)
        .map((r) => ({ title: (r.title || r.description.slice(0, 60)).slice(0, 300), description: (r.description || r.title).slice(0, 2000) }))
        .slice(0, 100),
      skills: (agent.skills ?? []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 120)).slice(0, 100),
      tools: (agent.enabledMcpToolIds ?? []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 160)).slice(0, 200),
      ragSources: (agent.ragSources ?? []).map((r) => (s(r?.name) || s(r?.fileName)).slice(0, 300)).filter(Boolean).slice(0, 200),
    },
    conversations: groupConversations(rows),
    language: 'es',
  };
}
