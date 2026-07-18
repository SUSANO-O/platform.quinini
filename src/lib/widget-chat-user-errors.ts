/** Mensajes amigables para el usuario final (sin códigos técnicos). */

const FRIENDLY: Record<string, string> = {
  AGENT_HUB_SYNC_REQUIRED:
    'Estoy reconectando con el asistente. Espera unos segundos, recarga la página e inténtalo de nuevo.',
  WIDGET_TOKEN_INVALID:
    'No pude validar el chat. Recarga la página (Cmd+Shift+R) e inicia sesión de nuevo si persiste.',
  WIDGET_CHAT_FAILED:
    'No pude procesar tu mensaje ahora. Inténtalo en unos segundos.',
  HUB_CHAT_PROXY_FAILED:
    'El asistente está ocupado. Espera unos segundos e inténtalo otra vez.',
  HUB_ERROR:
    'Hubo un problema temporal. Inténtalo de nuevo en un momento.',
  LANDING_SECRET_MISSING:
    'El asistente no está configurado en este entorno. Contacta al administrador.',
  AGENTFLOWHUB_URL_MISSING:
    'El asistente no está disponible temporalmente. Inténtalo más tarde.',
  QUOTA_EXCEEDED:
    'Has alcanzado el límite de conversaciones de tu plan este mes.',
  SESSION_TURN_LIMIT:
    'Esta conversación llegó al límite de mensajes. Pulsa «Nueva conversación» para empezar de cero.',
};

export function friendlyWidgetChatError(code?: string | null, fallback?: string): string {
  const c = typeof code === 'string' ? code.trim() : '';
  if (c && FRIENDLY[c]) return FRIENDLY[c];
  const fb = typeof fallback === 'string' ? fallback.trim() : '';
  if (fb && !/^(error|widget token|sincronizado|internal server)/i.test(fb)) return fb;
  return FRIENDLY.WIDGET_CHAT_FAILED;
}
