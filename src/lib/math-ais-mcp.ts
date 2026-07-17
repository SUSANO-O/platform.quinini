/** Tools MongoDB de solo lectura habilitadas para Math-ais (contexto del cliente logueado). */
export const MATH_AIS_MONGO_TOOL_IDS = [
  'mcp:mongodb:mongo_find',
  'mcp:mongodb:mongo_count_documents',
  'mcp:mongodb:mongo_list_collections',
] as const;

export function mathAisMongoToolIds(): string[] {
  return [...MATH_AIS_MONGO_TOOL_IDS];
}
