/**
 * Detección por código de "quiere abrir un ticket de soporte sin datos
 * todavía" — para no depender de que el LLM genere el marcador
 * `[[OPEN_TICKET_FORM]]` de forma confiable.
 *
 * Contexto: la skill `slack_escalation` le pide al modelo responder
 * ÚNICAMENTE con ese marcador cuando el usuario quiere reportar un problema
 * y no hay nombre+email en el historial — verificado en vivo contra el
 * agente real de Tribu GPS: el modelo lo hace solo ~15% de las veces (2/14
 * intentos), porque compite con reglas de negocio genéricas ("Protocolo de
 * Reclamos", "pedir los datos completos") que empujan a pedir los datos por
 * texto en su lugar. Ajustar el prompt no subió la tasa de forma confiable.
 *
 * Esta detección corre ANTES de llamar al LLM: si el mensaje actual suena a
 * pedido de ticket/reclamo y el email del usuario no aparece en ningún turno
 * anterior de la conversación, se fuerza el marcador directamente — sin
 * gastar una llamada al modelo y sin depender de que "decida bien".
 *
 * Deliberadamente conservador: prefiere un falso negativo (el LLM sigue
 * intentando, como hoy) a un falso positivo (mostrar el formulario cuando el
 * usuario no lo pidió) — por eso exige un verbo de reporte/queja explícito,
 * no solo la palabra "problema" sola.
 */

/** Exportado para ticket-deflection-intent.ts (recortar la frase matcheada y medir cuánto queda). */
export const TICKET_INTENT_PATTERNS: RegExp[] = [
  /\breportar\s+(un\s+)?(problema|falla|error|incidente|inconveniente)/i,
  /\babrir\s+(un\s+)?tickets?\b/i,
  /\blevantar\s+(un\s+)?tickets?\b/i,
  /\b(quiero|necesito|quisiera)\s+(un\s+)?tickets?\b/i,
  /\b(tengo|hacer|poner|presentar|radicar)\s+(un\s+)?(reclamo|queja|pqr)\b/i,
  /\bcrear\s+(un\s+)?tickets?\b/i,
  /\bsoporte\s+t[eé]cnico\b.*\b(reportar|reclamo|problema)\b/i,
];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export type ChatHistoryTurn = { role?: string; content?: unknown };

/** ¿El mensaje actual suena a "quiero reportar un problema / abrir un ticket"? */
export function looksLikeTicketRequest(message: string): boolean {
  const text = (message || '').trim();
  if (!text) return false;
  return TICKET_INTENT_PATTERNS.some((re) => re.test(text));
}

/**
 * ¿Ya hay un email de contacto en algún mensaje ANTERIOR del usuario en esta
 * conversación? Solo mira turnos de usuario (`role === 'user'`) — un email
 * mencionado por el propio bot (ej. una dirección de soporte) no cuenta.
 * El email es el dato que de verdad importa para poder responderle; el
 * "nombre" es demasiado ambiguo para detectar con una heurística confiable
 * (falsos positivos altísimos), así que no se exige acá.
 */
export function hasContactEmailInHistory(history: ChatHistoryTurn[] | null | undefined): boolean {
  if (!Array.isArray(history)) return false;
  return history.some((turn) => {
    if (!turn || turn.role !== 'user') return false;
    const content = typeof turn.content === 'string' ? turn.content : '';
    return EMAIL_RE.test(content);
  });
}

/**
 * Decide si hay que forzar el formulario de ticket por código, sin llamar
 * al LLM. `hasTicketCapability` gatea el chequeo completo: si el agente no
 * tiene la skill/tool de tickets habilitada, nunca se activa (evita mostrar
 * el formulario en agentes que no lo soportan).
 */
export function shouldForceTicketForm(params: {
  message: string;
  history: ChatHistoryTurn[] | null | undefined;
  hasTicketCapability: boolean;
}): boolean {
  const { message, history, hasTicketCapability } = params;
  if (!hasTicketCapability) return false;
  if (hasContactEmailInHistory(history)) return false;
  if (EMAIL_RE.test(message || '')) return false; // el usuario ya lo dio en este mismo mensaje
  return looksLikeTicketRequest(message);
}

export const OPEN_TICKET_FORM_MARKER = '[[OPEN_TICKET_FORM]]';
