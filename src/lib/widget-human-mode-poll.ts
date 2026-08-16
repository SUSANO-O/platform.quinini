/**
 * Decisión del poll del widget en modo humano.
 * «Devolver al bot» pone humanMode=false pero deja la solicitud abierta:
 * si solo se mira `resolved`, el visitante sigue hablando con el inbox.
 */

export type WidgetHumanModePollData = {
  resolved?: boolean;
  humanMode?: boolean;
};

export type WidgetHumanModePollAction = 'keep' | 'resolved' | 'bot_resumed';

export const WIDGET_BOT_RESUMED_MESSAGE =
  'El asistente retomó la conversación. Puedes seguir escribiendo aquí.';

export const WIDGET_HUMAN_JOINED_MESSAGE =
  'Un agente se unió a esta conversación. Te responderá aquí mismo.';

/** El visitante debe pasar a polling de inbox (humano activo, no resuelto). */
export function shouldJoinHumanInbox(
  data: WidgetHumanModePollData | null | undefined,
): boolean {
  return Boolean(data && data.humanMode === true && data.resolved !== true);
}

export function decideWidgetHumanModePollAction(
  data: WidgetHumanModePollData | null | undefined,
): WidgetHumanModePollAction {
  if (!data) return 'keep';
  if (data.resolved === true) return 'resolved';
  if (data.humanMode === false) return 'bot_resumed';
  return 'keep';
}
