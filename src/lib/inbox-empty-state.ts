/**
 * Qué decir cuando la bandeja se ve vacía.
 *
 * El filtro por defecto es "sin responder". Si no hay ninguna pendiente pero
 * sí conversaciones abiertas ya respondidas, la pantalla decía "Sin mensajes
 * pendientes de respuesta" mientras la pestaña de al lado mostraba el contero
 * real — y el cliente se iba creyendo que no tenía nada.
 *
 * No se cambia el filtro por debajo: se cuenta lo que hay y se ofrece el
 * salto, que lo decide quien mira.
 */

export type InboxTab = 'open' | 'resolved';
export type ReplyFilter = 'unanswered' | 'answered';

export type InboxEmptyState = {
  title: string;
  hint: string;
  /** Filtro al que vale la pena saltar, o `null` si no hay nada al lado. */
  switchTo: ReplyFilter | null;
  actionLabel: string | null;
};

const AYUDA = 'Cuando un visitante pida atención humana o escriba por WhatsApp, aparecerá aquí.';

export function resolveInboxEmptyState({
  tab,
  replyFilter,
  unanswered,
  answered,
}: {
  tab: InboxTab;
  replyFilter: ReplyFilter;
  unanswered: number;
  answered: number;
}): InboxEmptyState {
  if (tab === 'resolved') {
    return { title: 'Sin conversaciones resueltas', hint: AYUDA, switchTo: null, actionLabel: null };
  }

  const enPendientes = replyFilter === 'unanswered';
  const title = enPendientes ? 'Sin mensajes pendientes de respuesta' : 'Sin conversaciones respondidas';

  const otro: ReplyFilter = enPendientes ? 'answered' : 'unanswered';
  const cuantas = enPendientes ? answered : unanswered;

  if (cuantas > 0) {
    const plural = cuantas === 1 ? 'conversación abierta' : 'conversaciones abiertas';
    const estado = enPendientes ? 'ya respondida' : 'sin responder';
    return {
      title,
      hint: `Tenés ${cuantas} ${plural} ${cuantas === 1 ? estado : estado + 's'}.`,
      switchTo: otro,
      actionLabel: enPendientes ? 'Ver respondidas' : 'Ver sin responder',
    };
  }

  return { title, hint: AYUDA, switchTo: null, actionLabel: null };
}
