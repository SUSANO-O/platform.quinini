/**
 * Estado efímero de la encuesta de deflection de tickets, por sesión de
 * chat. Reusa WidgetSessionContext (memoria compartida multi-agente) en vez
 * de crear una colección nueva — mismo mecanismo, dos "facts" con su propia
 * caducidad corta (no la de 7 días de la colección: un estado de encuesta
 * "pendiente" de hace días no debería reaparecer en un mensaje sin relación).
 */
import {
  loadWidgetSessionContext,
  upsertWidgetSessionContext,
  type SessionFact,
} from '@/lib/widget-session-context';

const AWAITING_PROBLEM_KEY = 'ticket_deflection_awaiting_problem';
const PENDING_SURVEY_KEY = 'ticket_deflection_survey';
/** Si pasó más de esto desde que se guardó el estado, se considera vencido (conversación abandonada/retomada mucho después). */
const STATE_TTL_MS = 15 * 60 * 1000;

function isFresh(iso: string | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t < STATE_TTL_MS;
}

async function loadFacts(widgetId: string, chatSessionId: string, userId: string): Promise<SessionFact[]> {
  const ctx = await loadWidgetSessionContext(widgetId, chatSessionId, userId);
  return ctx?.facts ?? [];
}

async function replaceDeflectionFacts(
  widgetId: string,
  chatSessionId: string,
  userId: string,
  newFacts: SessionFact[],
): Promise<void> {
  const facts = await loadFacts(widgetId, chatSessionId, userId);
  const withoutDeflection = facts.filter(
    (f) => f.key !== AWAITING_PROBLEM_KEY && f.key !== PENDING_SURVEY_KEY,
  );
  await upsertWidgetSessionContext(widgetId, chatSessionId, userId, {
    facts: [...withoutDeflection, ...newFacts],
  });
}

/** ¿Le preguntamos "¿cuál es el problema?" en un turno anterior y seguimos esperando la respuesta? */
export async function isAwaitingProblemDescription(
  widgetId: string,
  chatSessionId: string,
  userId: string,
): Promise<boolean> {
  if (!widgetId || !chatSessionId || !userId) return false;
  const facts = await loadFacts(widgetId, chatSessionId, userId);
  const fact = facts.find((f) => f.key === AWAITING_PROBLEM_KEY);
  return isFresh(fact?.value);
}

export async function setAwaitingProblemDescription(
  widgetId: string,
  chatSessionId: string,
  userId: string,
): Promise<void> {
  if (!widgetId || !chatSessionId || !userId) return;
  await replaceDeflectionFacts(widgetId, chatSessionId, userId, [
    { key: AWAITING_PROBLEM_KEY, value: new Date().toISOString(), source: 'extracted' },
  ]);
}

export type PendingDeflectionSurvey = { sourceText: string };

/** Encuesta "¿esto te resolvió?" pendiente de respuesta, si sigue vigente. */
export async function getPendingDeflectionSurvey(
  widgetId: string,
  chatSessionId: string,
  userId: string,
): Promise<PendingDeflectionSurvey | null> {
  if (!widgetId || !chatSessionId || !userId) return null;
  const facts = await loadFacts(widgetId, chatSessionId, userId);
  const fact = facts.find((f) => f.key === PENDING_SURVEY_KEY);
  if (!fact) return null;
  try {
    const parsed = JSON.parse(fact.value) as { sourceText?: string; at?: string };
    if (!isFresh(parsed.at)) return null;
    if (typeof parsed.sourceText !== 'string' || !parsed.sourceText.trim()) return null;
    return { sourceText: parsed.sourceText };
  } catch {
    return null;
  }
}

export async function setPendingDeflectionSurvey(
  widgetId: string,
  chatSessionId: string,
  userId: string,
  survey: PendingDeflectionSurvey,
): Promise<void> {
  if (!widgetId || !chatSessionId || !userId) return;
  const value = JSON.stringify({ sourceText: survey.sourceText, at: new Date().toISOString() });
  await replaceDeflectionFacts(widgetId, chatSessionId, userId, [
    { key: PENDING_SURVEY_KEY, value, source: 'extracted' },
  ]);
}

/** Limpia awaiting-problem y encuesta pendiente — usar tras consumir cualquiera de los dos estados. */
export async function clearTicketDeflectionState(
  widgetId: string,
  chatSessionId: string,
  userId: string,
): Promise<void> {
  if (!widgetId || !chatSessionId || !userId) return;
  await replaceDeflectionFacts(widgetId, chatSessionId, userId, []);
}
