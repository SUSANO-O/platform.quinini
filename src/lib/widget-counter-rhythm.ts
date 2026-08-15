/**
 * Qué tools del widget se encienden en este turno.
 *
 * Copia espejo de matias-backend/src/lib/widget-counter-rhythm.ts — mantener ambos en sync.
 *
 * No toca el prompt del agente. Solo decide RAG, MCP, skills de cierre y HubSpot.
 */

import { isTrivialMessage, type SimpleTurn } from '@/lib/trivial-message';

type HistoryTurn = { role?: string; content?: string } | null | undefined;

/**
 * Pisos absolutos: por debajo hubo regresión 16:51 (720 tok → humano 57, frases cortadas).
 * Nunca se baja de aquí, aunque el agente tenga maxOutputTokens más bajo en Mongo.
 */
export const WIDGET_TOKEN_FLOOR = {
  coldGreeting: 400,
  conversational: 1200,
  full: 2000,
} as const;

/** Tope de salida: conversación completa (x2 sobre balance 1400/2400). */
export const WIDGET_TOKEN_BUDGET = {
  coldGreeting: 960,
  conversational: 2800,
  full: 4800,
} as const;

type WidgetTokenTier = keyof typeof WIDGET_TOKEN_BUDGET;

function resolvedTokenBudget(tier: WidgetTokenTier, agentMax?: number): number {
  const budget = WIDGET_TOKEN_BUDGET[tier];
  const floor = WIDGET_TOKEN_FLOOR[tier];
  const base = Math.max(floor, budget);
  if (typeof agentMax === 'number' && agentMax > 0) {
    return Math.max(floor, Math.min(agentMax, base));
  }
  return base;
}

/** Runtime (no edita el prompt del agente en Mongo): baja captura de lead en turnos pasivos. */
export const WIDGET_PASSIVE_COUNTER_DIRECTIVE =
  '- **Mostrador pasivo (este turno):** responde la pregunta del visitante y cierra la idea en una oración natural. **Prohibido** pedir teléfono, correo, WhatsApp, test drive o agendamiento salvo que él lo pida. Si ya hay hilo abierto, **no** lo saludes de nuevo.';

export const WIDGET_TURN_FOCUS_DIRECTIVE =
  '- **Enfoque del turno:** responde **solo** a la pregunta de este mensaje. No retomes otros temas del hilo (semáforos, angustia, tasación, lead) si el visitante no los nombra ahora.';

export const WIDGET_INVENTORY_NO_LEAD_DIRECTIVE =
  '- **Inventario / precio de lista:** entrega solo datos del documento o RAG (modelo, precio, sede). **No** cierres pidiendo contacto ni agendamiento en el mismo mensaje.';

export const WIDGET_REASONING_DIRECTIVE =
  '- **Retoma / diferencia de cambio:** razona en español con los precios del inventario ya conocidos. Si no tienes tasación del usado, dilo claro; no inventes rangos. **No** cambies de tema (semáforos, angustia, saludos).';

/** Skills que activan CRM/cierre. Fuera si el turno no pide agenda ni captura. */
export const LEAD_CAPTURE_SKILL_IDS = ['sales_closer', 'objection_handling', 'lead_qualifier'] as const;

/** Inventario, precios de lista, ficha, financiación: sí RAG / hojas. */
const KNOWLEDGE_RE =
  /\b(?:precio|precios|cuesta|costar|valor|cotiz(?:ar|aci[oó]n)?|inventario|stock|disponible|cat[aá]logo|brochure|ficha|financi(?:a|aci[oó]n)|cuota|entrada|garant[ií]a|retoma|permuta|cu[aá]nto\s+(?:me\s+)?(?:falt|cuesta|vale|sale|dan)|lista\s+de\s+precios|tienen?\s+(?:en\s+)?(?:el\s+)?inventario|qu[eé]\s+(?:kia|renault|chevrolet|mazda|toyota|hyundai|modelos?|versiones?))\b/i;

/** Cita, envío, webhook: MCP / calendario / HubSpot sí. */
const OPERATIONAL_RE =
  /\b(?:ag[eé]nd|cita|reserv|whatsapp|webhook|env[ií]a(?:me|le)?\s+(?:un\s+)?(?:correo|email|mail)|ll[aá]ma(?:me)?)\b/i;

const SHORT_PROCEED = new Set(['ok', 'oka', 'okay', 'vale', 'dale', 'listo', 'si', 'sí', 'yes']);

function lastAssistantAskedQuestion(history?: HistoryTurn[] | null): boolean {
  if (!Array.isArray(history) || history.length === 0) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (!h || typeof h !== 'object') continue;
    const role = String(h.role || '');
    if (role !== 'model' && role !== 'assistant') continue;
    const content = typeof h.content === 'string' ? h.content : '';
    return /[?¿]/.test(content);
  }
  return false;
}

function isShortProceedAfterQuestion(
  message: string,
  history?: HistoryTurn[] | null,
): boolean {
  const proceed = message.trim().toLowerCase().replace(/[!.,]+$/g, '');
  return SHORT_PROCEED.has(proceed) && lastAssistantAskedQuestion(history);
}

export function needsKnowledgeLookup(message: string): boolean {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw) return false;
  return KNOWLEDGE_RE.test(raw);
}

export function needsOperationalTools(message: string): boolean {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw) return false;
  return OPERATIONAL_RE.test(raw);
}

/**
 * HubSpot, webhook de lead y skills de cierre: solo si el visitante pide
 * agenda/envío o confirma una pregunta de esas tools.
 */
export function leadCaptureToolsAllowed(
  message: string,
  history?: HistoryTurn[] | null,
): boolean {
  if (needsOperationalTools(message)) return true;
  return isShortProceedAfterQuestion(message, history);
}

export function historyHasOpenThread(history?: HistoryTurn[] | null): boolean {
  if (!Array.isArray(history) || history.length === 0) return false;
  return history.some((h) => {
    if (!h || typeof h !== 'object') return false;
    const role = String(h.role || '');
    const content = typeof h.content === 'string' ? h.content.trim() : '';
    return (role === 'model' || role === 'assistant') && content.length > 0;
  });
}

/**
 * Lite solo en el primer “hola”. En un hilo abierto el modelo del agente
 * mantiene el tono; el barato saluda otra vez y rompe la conversación.
 */
export function shouldUseCheapGreetingModel(
  message: string,
  history?: SimpleTurn[] | HistoryTurn[] | null,
): boolean {
  const hist = Array.isArray(history) ? (history as SimpleTurn[]) : undefined;
  return isTrivialMessage(message, hist) && !historyHasOpenThread(history);
}

export function shouldSkipHeavyWidgetPath(
  message: string,
  history?: SimpleTurn[] | HistoryTurn[] | null,
): boolean {
  const hist = Array.isArray(history) ? (history as SimpleTurn[]) : undefined;
  if (isShortProceedAfterQuestion(message, history)) return false;
  if (isTrivialMessage(message, hist)) return true;
  if (needsKnowledgeLookup(message)) return false;
  if (needsOperationalTools(message)) return false;
  return true;
}

/** Tope de tokens según el turno. `undefined` no se usa: siempre hay techo. */
export function widgetReplyMaxTokens(params: {
  message: string;
  history?: HistoryTurn[] | null;
  agentMax?: number;
}): number {
  const agentMax =
    typeof params.agentMax === 'number' && params.agentMax > 0 ? params.agentMax : undefined;
  if (shouldUseCheapGreetingModel(params.message, params.history)) {
    return resolvedTokenBudget('coldGreeting', agentMax);
  }
  if (shouldSkipHeavyWidgetPath(params.message, params.history)) {
    return resolvedTokenBudget('conversational', agentMax);
  }
  return resolvedTokenBudget('full', agentMax);
}

/** Directivas runtime según el turno (capa tools, no Mongo). */
export function widgetRuntimeDirectives(
  message: string,
  history?: HistoryTurn[] | null,
): string[] {
  const lines: string[] = [WIDGET_TURN_FOCUS_DIRECTIVE];
  const allowLead = leadCaptureToolsAllowed(message, history);
  if (!allowLead) {
    lines.push(WIDGET_PASSIVE_COUNTER_DIRECTIVE);
  }
  if (needsKnowledgeLookup(message) && !allowLead) {
    lines.push(WIDGET_INVENTORY_NO_LEAD_DIRECTIVE);
  }
  if (
    /\b(?:razona|razonamiento|cu[aá]nto\s+me\s+faltar|diferencia|retoma|permuta|tasaci[oó]n|aval[uú]o)\b/i.test(
      message,
    )
  ) {
    lines.push(WIDGET_REASONING_DIRECTIVE);
  }
  return lines;
}
