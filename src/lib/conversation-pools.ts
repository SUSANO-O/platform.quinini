/** Identificador en RequestLog para consumo vía API REST. */
export const API_REQUEST_LOG_WIDGET_ID = 'api:rest';

export type ConversationPool = 'agents' | 'api';

export function isApiPoolLog(widgetId: unknown): boolean {
  return typeof widgetId === 'string' && widgetId.startsWith('api:');
}

export function isAgentPoolLog(widgetId: unknown): boolean {
  return typeof widgetId === 'string' && widgetId.length > 0 && !isApiPoolLog(widgetId);
}

export function matchesConversationPool(widgetId: unknown, pool: ConversationPool): boolean {
  return pool === 'api' ? isApiPoolLog(widgetId) : isAgentPoolLog(widgetId);
}
