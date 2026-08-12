/** Mensajes del dashboard — sin BACKEND_URL ni errores de red crudos; motor = Stargate. */

export const STARGATE_CONNECTION_ERROR = 'No se pudo conectar con Stargate.';

export const HUB_UNAVAILABLE_USER_MESSAGE = STARGATE_CONNECTION_ERROR;

export const HUB_MCP_CATALOG_USER_MESSAGE = STARGATE_CONNECTION_ERROR;

export const HUB_MODELS_CATALOG_USER_MESSAGE = STARGATE_CONNECTION_ERROR;

const TECHNICAL =
  /BACKEND_URL|AIBACKHUB|AIBackHub|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|HTTP\s*\d{3}|\.env|AgentFlowhub|127\.0\.0\.1|localhost:\d|no configurado/i;

export function isTechnicalHubError(message: string): boolean {
  return TECHNICAL.test(message);
}

export function friendlyHubErrorMessage(
  fallback?: string | null,
  defaultMessage: string = HUB_UNAVAILABLE_USER_MESSAGE,
): string {
  const fb = typeof fallback === 'string' ? fallback.trim() : '';
  if (!fb || isTechnicalHubError(fb)) return defaultMessage;
  return fb;
}
