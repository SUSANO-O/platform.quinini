/**
 * Banco de pruebas de agentes (Fase 1): formato de los casos.
 *
 * Cada suite es un JSON en `evals/<agente>.json` con preguntas reales de usuarios y lo que una
 * respuesta correcta DEBE contener según la fuente de verdad (documentos e instrucciones del agente).
 * El juez compara la respuesta del agente contra esto; nunca contra su propio conocimiento.
 */

/** Qué se espera que haga el agente en el caso. */
export type EvalBehavior =
  /** Responder con los datos de `facts`. */
  | 'answer'
  /** No está en sus fuentes: decir que no lo sabe / no inventar, y ofrecer un canal. */
  | 'dont_know'
  /** Derivar a soporte humano (con los canales), sin dar pasos por su cuenta. */
  | 'escalate'
  /** Emergencia: dar primero la línea de emergencias y los pasos de seguridad. */
  | 'emergency'
  /** Pedir un dato que falta antes de responder (p. ej. si la cuenta es persona o empresa). */
  | 'clarify';

export const EVAL_BEHAVIORS: readonly EvalBehavior[] = ['answer', 'dont_know', 'escalate', 'emergency', 'clarify'];

export type EvalTurn = { role: 'user' | 'model'; content: string };

export type EvalCase = {
  /** Identificador estable (se usa para comparar corridas). */
  id: string;
  /** Agrupa el informe: navegacion, soporte, emergencia, seguimiento, fuera_de_fuentes… */
  category: string;
  /** Mensaje del usuario que se evalúa. */
  message: string;
  /** Turnos anteriores (para preguntas de seguimiento). */
  history?: EvalTurn[];
  /** Página donde está el usuario (widgets con mapa de la app / leer la pantalla). */
  pagePath?: string;
  pageTitle?: string;
  /** Estructura de la pantalla tal como la enviaría el widget con "Leer la pantalla". */
  screenContext?: string;
  expect: {
    behavior: EvalBehavior;
    /** Datos que una respuesta correcta debe transmitir (con sus palabras o equivalentes). */
    facts?: string[];
    /** Cosas que NO debe afirmar (invenciones típicas, datos de otro caso, promesas falsas). */
    mustNot?: string[];
  };
  /** De dónde sale la respuesta esperada (sección del documento / instrucciones). */
  source: string;
};

export type EvalSuite = {
  /** Nombre corto del agente (navi, navi-app…). */
  agent: string;
  /** Widget real cuyo agente, mapa de la app y "leer la pantalla" se usan. */
  widgetId: string;
  description?: string;
  cases: EvalCase[];
};

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

/** Email o teléfono (7+ dígitos) en lo que "escribe" el usuario de prueba. */
const CONTACT_DATA_RE = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\d[\s.-]?){7,}/;

/**
 * Los casos nunca llevan datos de contacto en los mensajes del usuario: con email o teléfono el
 * agente intentaría capturar un lead. El modo de prueba ya lo bloquea; esto es la segunda barrera.
 */
export function caseUserTextHasContactData(c: Pick<EvalCase, 'message' | 'history'>): boolean {
  const userTexts = [c.message, ...(c.history ?? []).filter((t) => t.role === 'user').map((t) => t.content)];
  return userTexts.some((t) => typeof t === 'string' && CONTACT_DATA_RE.test(t));
}

/** Valida una suite cargada de JSON. Devuelve la lista de problemas (vacía = válida). */
export function validateEvalSuite(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return ['la suite no es un objeto'];
  const s = raw as Partial<EvalSuite>;
  if (typeof s.agent !== 'string' || !s.agent.trim()) errors.push('falta "agent"');
  if (typeof s.widgetId !== 'string' || !/^[a-f0-9]{24}$/i.test(s.widgetId)) errors.push('"widgetId" debe ser un id de 24 hex');
  if (!Array.isArray(s.cases) || s.cases.length === 0) {
    errors.push('"cases" debe tener al menos un caso');
    return errors;
  }
  const seen = new Set<string>();
  s.cases.forEach((c, i) => {
    const at = `caso #${i + 1}${c && typeof c.id === 'string' ? ` (${c.id})` : ''}`;
    if (!c || typeof c !== 'object') {
      errors.push(`${at}: no es un objeto`);
      return;
    }
    if (typeof c.id !== 'string' || !ID_RE.test(c.id)) errors.push(`${at}: "id" inválido (minúsculas, números, - y _)`);
    else if (seen.has(c.id)) errors.push(`${at}: "id" repetido`);
    else seen.add(c.id);
    if (typeof c.category !== 'string' || !c.category.trim()) errors.push(`${at}: falta "category"`);
    if (typeof c.message !== 'string' || !c.message.trim()) errors.push(`${at}: falta "message"`);
    if (typeof c.source !== 'string' || !c.source.trim()) errors.push(`${at}: falta "source" (de dónde sale la respuesta esperada)`);
    if (typeof c.message === 'string' && caseUserTextHasContactData(c)) {
      errors.push(`${at}: los mensajes del usuario no pueden llevar emails ni teléfonos (dispararían la captura de leads)`);
    }
    if (c.history !== undefined) {
      if (!Array.isArray(c.history)) errors.push(`${at}: "history" debe ser una lista`);
      else
        c.history.forEach((t, j) => {
          if (!t || (t.role !== 'user' && t.role !== 'model') || typeof t.content !== 'string' || !t.content.trim()) {
            errors.push(`${at}: turno ${j + 1} del historial inválido`);
          }
        });
    }
    const e = c.expect;
    if (!e || typeof e !== 'object') {
      errors.push(`${at}: falta "expect"`);
      return;
    }
    if (!EVAL_BEHAVIORS.includes(e.behavior)) errors.push(`${at}: "expect.behavior" debe ser uno de ${EVAL_BEHAVIORS.join(', ')}`);
    const facts = e.facts ?? [];
    if (!Array.isArray(facts) || facts.some((f) => typeof f !== 'string' || !f.trim())) {
      errors.push(`${at}: "expect.facts" debe ser una lista de textos`);
    }
    if (e.mustNot !== undefined && (!Array.isArray(e.mustNot) || e.mustNot.some((f) => typeof f !== 'string' || !f.trim()))) {
      errors.push(`${at}: "expect.mustNot" debe ser una lista de textos`);
    }
    if ((e.behavior === 'answer' || e.behavior === 'emergency') && facts.length === 0) {
      errors.push(`${at}: un caso "${e.behavior}" necesita al menos un dato en "expect.facts"`);
    }
  });
  return errors;
}
