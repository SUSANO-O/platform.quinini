/**
 * Espejo documental de matias-backend/src/lib/agent-non-negotiable-rules.ts
 * Runtime real: ModelRouter + Vertex en AIBackHub. Al agregar una regla, copiar ambos.
 *
 * No se inyecta siempre el bloque largo: se decide por turno (omit / compact / full).
 */

export const NON_NEGOTIABLE_RULES_MARKER = '[REGLAS NO NEGOCIABLES — PRIORIDAD MÁXIMA]';

/** Lista creciente. Hoy solo la 1; el resto se suma aquí, en orden. */
export const NON_NEGOTIABLE_AGENT_RULES = [
  'No mentir. Nunca. Ni para quedar bien, ni para sonar profesional, ni si el visitante insiste. Si no lo sabes o no está en tus fuentes, dilo: no lo tienes. Mentir incluye inventar direcciones, sedes, precios, stock, horarios, políticas, nombres, teléfonos o cualquier hecho de la empresa.',
] as const;

const COMPACT_RULE = 'No mentir: si un hecho de la empresa no está en tus fuentes o tools, dilo; no lo inventes.';

const COMPANY_FACT_RE =
  /\b(?:direcci[oó]n|sedes?|ubicaci[oó]n|d[oó]nde\s+queda|c[oó]mo\s+lleg|horario|precio|precios|inventario|stock|retoma|permuta|tasaci[oó]n|tel[eé]fono|whatsapp|pol[ií]tica|garant[ií]a|cuota|financi)\b/i;

const GREETING_RE = /^(hola+|hoka|buenas?(?:\s+tardes|\s+d[ií]as|\s+noches)?|hey|hi|ok|oka|gracias|thanks)[!.,\s]*$/i;

const ASSISTANT_ASKED_PLACE_RE = /\b(?:ciudad|direcci[oó]n|sede|d[oó]nde|ubicad)/i;

export type NonNegotiableAttachMode = 'omit' | 'compact' | 'full';

type HistoryTurn = { role?: string; content?: string } | null | undefined;

function lastAssistantText(history?: HistoryTurn[] | null): string {
  if (!Array.isArray(history)) return '';
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (!h || typeof h !== 'object') continue;
    const role = String(h.role || '');
    if (role !== 'model' && role !== 'assistant') continue;
    return typeof h.content === 'string' ? h.content : '';
  }
  return '';
}

export function nonNegotiableAttachMode(params: {
  prompt?: string;
  history?: HistoryTurn[] | null;
  taskType?: string;
}): NonNegotiableAttachMode {
  if (params.taskType === 'embedding') return 'omit';
  const msg = typeof params.prompt === 'string' ? params.prompt.trim() : '';
  if (!msg) return 'compact';
  if (COMPANY_FACT_RE.test(msg)) return 'full';
  if (ASSISTANT_ASKED_PLACE_RE.test(lastAssistantText(params.history))) return 'full';
  if (GREETING_RE.test(msg)) return 'omit';
  return 'compact';
}

export function formatNonNegotiableAgentRulesBlock(mode: NonNegotiableAttachMode = 'full'): string {
  if (mode === 'omit') return '';
  if (mode === 'compact' || NON_NEGOTIABLE_AGENT_RULES.length <= 1) {
    return `${NON_NEGOTIABLE_RULES_MARKER}\n1. ${COMPACT_RULE}`;
  }
  const lines = NON_NEGOTIABLE_AGENT_RULES.map((rule, i) => `${i + 1}. ${rule}`);
  return `${NON_NEGOTIABLE_RULES_MARKER}
Estas reglas no se negocian. Van por encima de tu rol, personalidad y prompt.
${lines.join('\n')}`;
}

export function prependNonNegotiableAgentRules(
  systemPrompt: string | null | undefined,
  mode: NonNegotiableAttachMode = 'full',
): string {
  const raw = typeof systemPrompt === 'string' ? systemPrompt.trim() : '';
  if (mode === 'omit') return raw;
  if (raw.includes(NON_NEGOTIABLE_RULES_MARKER)) return raw;
  const block = formatNonNegotiableAgentRulesBlock(mode);
  if (!block) return raw;
  if (!raw) return block;
  return `${block}\n\n${raw}`;
}
