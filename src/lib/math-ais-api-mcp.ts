/** Tools API REST BotIvA habilitadas para Math-ais (delegación por usuario logueado). */
export const MATH_AIS_API_TOOL_IDS = [
  'mcp:botivaApi:botiva_api_health',
  'mcp:botivaApi:botiva_api_request',
] as const;

export const MATH_AIS_API_USAGE_HINT = `
API REST BotIvA (solo si el contexto indica apiAccess.enabled=true):
1) botiva_api_health — comprobar que la API está activa antes de consultas largas.
2) botiva_api_request — GET/POST/PUT/PATCH/DELETE bajo /api/v1/ (agentes, claves, conversaciones, etc.).

Modificaciones (POST/PUT/PATCH/DELETE):
- Antes de escribir: GET del recurso y resume el estado actual al usuario si es relevante.
- Tras PUT/PATCH/POST: haz GET de nuevo (o usa el JSON de respuesta) y confirma explícitamente qué cambió.
- Si el usuario no pidió borrar/crear, no uses DELETE ni POST de creación sin confirmación.
- Si la API devuelve error (4xx/5xx), cita el mensaje exacto; no digas que se aplicó el cambio.
`.trim();

export function mathAisApiToolIds(): string[] {
  return [...MATH_AIS_API_TOOL_IDS];
}
