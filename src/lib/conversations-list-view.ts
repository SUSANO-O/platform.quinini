/**
 * Qué chats se ven en Dashboard → Chats y en qué orden.
 *
 * Dos reglas, las dos con motivo:
 *
 * 1. Un chat sin un solo mensaje no es una conversación: es alguien que abrió
 *    el widget y se fue. Llenaban la lista y enterraban las conversaciones de
 *    verdad.
 * 2. El orden es por ÚLTIMA ACTIVIDAD, no por cuándo se abrió la sesión. Un
 *    chat abierto ayer al que el visitante acaba de escribir es lo más urgente
 *    que hay, y ordenando por `startedAt` quedaba sepultado.
 */

export type ChatListRow = {
  messageCount?: number;
  lastMessageAt?: string | null;
};

/** Un chat cuenta si tiene al menos un mensaje. */
export function tieneMensajes(row: ChatListRow): boolean {
  return typeof row.messageCount === 'number' && row.messageCount > 0;
}

/** Milisegundos de la última actividad; sin fecha válida, al fondo. */
function actividad(row: ChatListRow): number {
  if (!row.lastMessageAt) return -Infinity;
  const t = new Date(row.lastMessageAt).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Filtra los vacíos, ordena del más reciente al más antiguo y recorta.
 * No muta la lista de entrada.
 */
export function visibleChatSessions<T extends ChatListRow>(rows: T[], limit: number): T[] {
  return rows
    .filter(tieneMensajes)
    .slice()
    .sort((a, b) => actividad(b) - actividad(a))
    .slice(0, Math.max(0, limit));
}
