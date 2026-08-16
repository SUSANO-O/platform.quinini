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
 * El landing antepone [CONTEXTO DE SESIÓN] al mensaje. El gating y { search }
 * deben verse solo lo que escribió el visitante en este turno.
 */
export function widgetTurnUserText(raw: string): string {
  const t = typeof raw === 'string' ? raw : '';
  const marker = '[MENSAJE DEL USUARIO]';
  const i = t.lastIndexOf(marker);
  if (i >= 0) return t.slice(i + marker.length).trim();
  if (/CONTEXTO DE SESI[OÓ]N/i.test(t)) return '';
  return t.trim();
}

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
  '- **Mostrador pasivo (este turno):** responde la pregunta del visitante y cierra la idea en una oración natural. **Prohibido** pedir teléfono, correo, WhatsApp, demo o agendamiento salvo que él lo pida. Si ya hay hilo abierto, **no** lo saludes de nuevo.';

export const WIDGET_TURN_FOCUS_DIRECTIVE =
  '- **Enfoque del turno:** responde **solo** a la pregunta de este mensaje. No retomes otros temas del hilo (emoción, cálculo, lead) si el visitante no los nombra ahora. Si ya hay conversación, **no** saludes de nuevo.';

/** Un retry de orquestación si el modelo ignora el enfoque. */
export const WIDGET_TURN_FOCUS_RETRY =
  '[Corrección de enfoque: no saludes de nuevo. Responde solo a este mensaje. No retomes emoción ni síntomas de otro turno si el visitante no los nombra ahora. Si este mensaje pide un recuerdo, respóndelo.]';

export const WIDGET_INVENTORY_NO_LEAD_DIRECTIVE =
  '- **Catálogo / precio de lista:** entrega solo datos del documento o RAG. **No** cierres pidiendo contacto ni agendamiento en el mismo mensaje.';

export const WIDGET_REASONING_DIRECTIVE =
  '- **Cifras ya conocidas:** razona en español con los números que ya tienes. Si falta un dato, dilo claro; no inventes rangos. **No** cambies de tema ni saludes de nuevo.';

/** Plantilla; el runtime interpola los datos de este turno. */
export const WIDGET_STATED_FACTS_ECHO_DIRECTIVE =
  '- **Datos que acaba de contar (este turno):** repite cada dato concreto (nombre, producto, color, cifras). No omitas ni generalices.';

/** @deprecated alias — el eco no es de un vertical. */
export const WIDGET_VEHICLE_FACTS_ECHO_DIRECTIVE = WIDGET_STATED_FACTS_ECHO_DIRECTIVE;

const STATED_COLOR_RE = /\b(blanc[oa]|negr[oa]|roj[oa]|gris|azul|platead[oa]|verde|beige)\b/i;

function statedFactsEchoDirective(message: string): string {
  const bits: string[] = [];
  const name = message.match(/\bme\s+llamo\s+([A-Za-zÁÉÍÓÚáéíóúüÜñÑ]+)/i);
  if (name?.[1]) bits.push(name[1]);
  const color = message.match(STATED_COLOR_RE);
  if (color?.[1]) bits.push(color[1].toLowerCase());
  const year = message.match(/\b(20\d{2})\b/);
  if (year?.[1]) bits.push(year[1]);
  const km = message.match(/\b(\d{3,6})\s*(?:km|kil[oó]metros?)\b/i);
  if (km?.[1]) bits.push(`${km[1]} km`);
  const extra = bits.length ? ` Si dijo ${bits.map((b) => `"${b}"`).join(', ')}, escríbelo igual.` : '';
  return `${WIDGET_STATED_FACTS_ECHO_DIRECTIVE}${extra}`;
}

/** Skills que activan CRM/cierre. Fuera si el turno no pide agenda ni captura. */
export const LEAD_CAPTURE_SKILL_IDS = ['sales_closer', 'objection_handling', 'lead_qualifier'] as const;

/** Catálogo, precios, ficha, política: sí RAG / docs. Sin marcas de un cliente. */
const KNOWLEDGE_RE =
  /\b(?:precio|precios|cuesta|costar|valor|cotiz(?:ar|aci[oó]n)?|inventario|stock|disponible|cat[aá]logo|brochure|ficha|financi(?:a|aci[oó]n)|cuota|entrada|garant[ií]a|retoma|permuta|cu[aá]nto\s+(?:me\s+)?(?:falt|cuesta|vale|sale|dan)|lista\s+de\s+precios|tienen?\s+(?:en\s+)?(?:el\s+)?(?:inventario|cat[aá]logo)|qu[eé]\s+(?:modelos?|versiones?|planes?|productos?|servicios?))\b/i;

/** Cita, envío, contacto, webhook: MCP / calendario / HubSpot sí. */
const OPERATIONAL_RE =
  /\b(?:ag[eé]nd|cita|reserv|whatsapp|webhook|env[ií]a(?:me|le)?\s+(?:un\s+)?(?:correo|email|mail)|ll[aá]ma(?:me)?|contact(?:ar(?:me|nos|te|los|les)?|o|enme|arme)|me\s+contact(?:an|en|e)|c[oó]mo\s+me\s+(?:contacto|comunico)|hablar\s+con|comunica(?:rme|nos)|d[eé]j(?:o|ame|enme)\s+(?:mis\s+)?datos)\b/i;

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
  const proceed = widgetTurnUserText(message).toLowerCase().replace(/[!.,]+$/g, '');
  return SHORT_PROCEED.has(proceed) && lastAssistantAskedQuestion(history);
}

export function needsKnowledgeLookup(message: string): boolean {
  const raw = widgetTurnUserText(message);
  if (!raw) return false;
  return KNOWLEDGE_RE.test(raw);
}

export function needsOperationalTools(message: string): boolean {
  const raw = widgetTurnUserText(message);
  if (!raw) return false;
  return OPERATIONAL_RE.test(raw);
}

/**
 * El visitante acaba de declarar un ítem propio (nombre + tengo / tengo un…).
 * No aplica a recuerdos ni a catálogo/precio.
 */
export function needsStatedFactsEcho(message: string): boolean {
  const raw = widgetTurnUserText(message);
  if (!raw || /[?¿]/.test(raw)) return false;
  if (needsKnowledgeLookup(raw) || needsOperationalTools(raw)) return false;
  if (/\b(?:te\s+acuerdas|recuerdas|cu[aá]ntos?\s+kil[oó]met|de\s+qu[eé]\s+color\s+(?:era|ten[ií]a))\b/i.test(raw)) {
    return false;
  }
  const presentsOwnItem =
    /\bme\s+llamo\b[\s\S]{0,160}\btengo\b/i.test(raw) || /\btengo\s+(?:un|una|mi)\s+\w+/i.test(raw);
  if (!presentsOwnItem) return false;
  return (
    STATED_COLOR_RE.test(raw) ||
    /\b20\d{2}\b/.test(raw) ||
    /\b(?:kil[oó]met|\d{3,6}\s*km)\b/i.test(raw) ||
    /\b(?:cambiar|retoma|permuta|m[aá]s\s+nuevo|renovar)\b/i.test(raw)
  );
}

export const needsVehicleFactsEcho = needsStatedFactsEcho;

const TURN_EMOTION_RE = /\b(?:angust|miedo|preocup|estr[eé]s|zozobra|temor)/i;
const TURN_REGREET_RE = /^(?:¡?\s*)?(?:hola|buenas|qu[eé]\s+gusto\s+saludarte)/i;
const TURN_REASONING_RE =
  /\b(?:razona|razonamiento|cu[aá]nto\s+me\s+faltar|diferencia|retoma|permuta|tasaci[oó]n|aval[uú]o)\b/i;

const FOCUS_STOP = new Set([
  'este',
  'esta',
  'esto',
  'para',
  'como',
  'cuando',
  'tiene',
  'tienen',
  'tengo',
  'quiero',
  'vamos',
  'carro',
  'auto',
  'vehiculo',
  'equipo',
  'producto',
  'problema',
  'revisar',
  'revision',
  'verdad',
  'todas',
  'todos',
  'decir',
  'dije',
  'color',
]);

function foldFocusText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function distinctiveFocusTokens(text: string): Set<string> {
  const out = new Set<string>();
  const parts = foldFocusText(text).match(/[a-z0-9]+/g) ?? [];
  for (const p of parts) {
    if (p.length < 4) continue;
    if (FOCUS_STOP.has(p)) continue;
    out.add(p);
  }
  return out;
}

function priorEmotionalTokens(history?: HistoryTurn[] | null): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(history)) return out;
  for (const h of history) {
    if (!h || typeof h !== 'object') continue;
    const role = String(h.role || '');
    if (role !== 'user') continue;
    const content = typeof h.content === 'string' ? h.content : '';
    if (!TURN_EMOTION_RE.test(content)) continue;
    for (const t of distinctiveFocusTokens(content)) out.add(t);
  }
  return out;
}

function replyLeaksPriorEmotion(params: {
  message: string;
  reply: string;
  history?: HistoryTurn[] | null;
}): boolean {
  if (TURN_EMOTION_RE.test(params.message)) return false;
  const prior = priorEmotionalTokens(params.history);
  if (prior.size === 0) return false;
  const current = distinctiveFocusTokens(params.message);
  for (const t of current) {
    if (prior.has(t)) return false;
  }
  const replyToks = distinctiveFocusTokens(params.reply);
  for (const t of prior) {
    if (replyToks.has(t) && !current.has(t)) return true;
  }
  return false;
}

function turnNeedsFocusGuard(message: string): boolean {
  return needsKnowledgeLookup(message) || needsOperationalTools(message) || TURN_REASONING_RE.test(message);
}

/**
 * El modelo saludó de nuevo o arrastró emoción de otro turno.
 * No importa inventory-intent (evita ciclo: intent ya importa rhythm).
 */
export function replyDriftsFromTurn(params: {
  message: string;
  reply: string;
  history?: HistoryTurn[] | null;
}): boolean {
  const message = widgetTurnUserText(params.message);
  const reply = typeof params.reply === 'string' ? params.reply.trim() : '';
  if (!reply) return false;
  const open = historyHasOpenThread(params.history);
  if (open && TURN_REGREET_RE.test(reply) && !needsStatedFactsEcho(message)) {
    return true;
  }
  if (turnNeedsFocusGuard(message) && TURN_EMOTION_RE.test(reply) && !TURN_EMOTION_RE.test(message)) {
    return true;
  }
  if (replyLeaksPriorEmotion({ message, reply, history: params.history })) {
    return true;
  }
  return false;
}

/**
 * En hilo abierto quita un saludo de apertura. El modelo de fase 2 a veces
 * ve solo el turno actual y dice «Hola» otra vez.
 */
export function stripLeadingRegreet(
  reply: string,
  history?: HistoryTurn[] | null,
): string {
  const text = typeof reply === 'string' ? reply.trim() : '';
  if (!text) return text;
  if (!historyHasOpenThread(history)) return text;
  if (!TURN_REGREET_RE.test(text)) return text;
  const stripped = text
    .replace(
      /^(?:¡?\s*)?(?:hola|buenas(?:\s+(?:tardes|d[ií]as|noches))?|qu[eé]\s+gusto\s+saludarte)(?:\s*[,:]?\s*[^.!?\n]{0,48})?[.!?…]?\s*/i,
      '',
    )
    .trim();
  return stripped || text;
}

/**
 * Skills de cierre y pedir contacto: solo si el visitante pide agenda, envío
 * o contacto, o confirma una pregunta de esas tools. La alta HubSpot automática
 * (2 de 3 campos ya dichos) no usa esta función.
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
  return isTrivialMessage(widgetTurnUserText(message), hist) && !historyHasOpenThread(history);
}

export function shouldSkipHeavyWidgetPath(
  message: string,
  history?: SimpleTurn[] | HistoryTurn[] | null,
): boolean {
  const hist = Array.isArray(history) ? (history as SimpleTurn[]) : undefined;
  const turn = widgetTurnUserText(message);
  if (isShortProceedAfterQuestion(turn, history)) return false;
  if (isTrivialMessage(turn, hist)) return true;
  if (needsKnowledgeLookup(turn)) return false;
  if (needsOperationalTools(turn)) return false;
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
  const turn = widgetTurnUserText(message);
  const lines: string[] = [WIDGET_TURN_FOCUS_DIRECTIVE];
  const allowLead = leadCaptureToolsAllowed(turn, history);
  if (!allowLead) {
    lines.push(WIDGET_PASSIVE_COUNTER_DIRECTIVE);
  }
  if (needsKnowledgeLookup(turn) && !allowLead) {
    lines.push(WIDGET_INVENTORY_NO_LEAD_DIRECTIVE);
  }
  if (TURN_REASONING_RE.test(turn)) {
    lines.push(WIDGET_REASONING_DIRECTIVE);
  }
  if (needsStatedFactsEcho(turn)) {
    lines.push(statedFactsEchoDirective(turn));
  }
  return lines;
}
