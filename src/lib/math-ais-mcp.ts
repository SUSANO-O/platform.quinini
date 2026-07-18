/** Tools MongoDB de solo lectura habilitadas para Math-ais (contexto del cliente logueado). */
export const MATH_AIS_MONGO_TOOL_IDS = [
  'mcp:mongodb:mongo_find',
  'mcp:mongodb:mongo_count_documents',
  'mcp:mongodb:mongo_list_collections',
] as const;

/** Guía de uso MCP Mongo para Math-ais (preferir snapshot del contexto). */
export const MATH_AIS_MCP_USAGE_HINT = `
Prioridad de datos:
1) Snapshot y contexto de sesión (nombre, plan, agentes, widgets, pantalla).
2) mongo_count_documents / mongo_find solo si falta un detalle no presente en el snapshot.
3) mongo_list_collections solo para diagnóstico interno — no mencionar al usuario.

Siempre filtrar por userId del contexto. Nunca consultar otros usuarios.
`.trim();

export function mathAisMongoToolIds(): string[] {
  return [...MATH_AIS_MONGO_TOOL_IDS];
}
