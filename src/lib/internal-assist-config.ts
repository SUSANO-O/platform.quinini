/**
 * Configuración del asistente interno (dashboard + marketing).
 * Valores por defecto; override vía env en servidor.
 */

/** Mantener en sync con `VERSION` en scripts/widget/core.js (cache-bust de assist.js). */
export const WIDGET_SDK_VERSION = '1.6.28';

export type InternalAssistContext = 'app' | 'marketing';

export type InternalAssistBootConfig = {
  agentId: string;
  host: string;
  color: string;
  title: string;
  subtitle: string;
  welcome: string;
  fabHint: string;
  avatar?: string;
  position: string;
  edgeInset: number;
  offsetBottom: number;
  offsetTop: number;
  humanSupportPhone?: string;
  /** WhatsApp (oferta de atención humana por palabra clave). */
  humanSupportEnabled?: boolean;
  /** Botón/formulario "Hablar con una persona" (inbox/canales). Desactivado: solo WhatsApp. */
  handoffEnabled?: boolean;
  borderRadius: number;
  theme: 'light' | 'dark';
  autoOpen: boolean;
  debug: boolean;
  /** Token wt_* del widget en Mongo (capturas, handoff, cuota). */
  token?: string;
  widgetId?: string;
};

function envStr(key: string, fallback: string): string {
  const v = process.env[key]?.trim();
  return v || fallback;
}

function envNum(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) ? n : fallback;
}

export function resolveInternalAssistBoot(
  context: InternalAssistContext,
  requestOrigin: string,
): InternalAssistBootConfig {
  // El SDK corre en el navegador del visitante: las peticiones /api/widget/* deben ir
  // al mismo origen donde se sirve la página (no a NEXT_PUBLIC_APP_URL si apunta a otro deploy).
  const host = requestOrigin.replace(/\/$/, '') || envStr('NEXT_PUBLIC_APP_URL', requestOrigin).replace(/\/$/, '');

  if (context === 'marketing') {
    return {
      agentId: envStr('INTERNAL_MARKETING_ASSIST_AGENT_ID', 'math'),
      host,
      color: envStr('INTERNAL_MARKETING_ASSIST_COLOR', '#006B7D'),
      title: envStr('INTERNAL_MARKETING_ASSIST_TITLE', 'Math'),
      subtitle: envStr('INTERNAL_MARKETING_ASSIST_SUBTITLE', 'En linea'),
      welcome: envStr('INTERNAL_MARKETING_ASSIST_WELCOME', 'Hola! Como puedo ayudarte hoy?'),
      fabHint: envStr('INTERNAL_MARKETING_ASSIST_FAB_HINT', 'Hola! Como puedo ayudarte hoy?'),
      avatar: envStr(
        'INTERNAL_MARKETING_ASSIST_AVATAR',
        '/assets/marketing/math-avatar-cutout.webp',
      ),
      // Solo WhatsApp por ahora: sin "Hablar con una persona" (inbox/canales).
      humanSupportEnabled: true,
      handoffEnabled: false,
      position: 'bottom-right',
      edgeInset: envNum('INTERNAL_ASSIST_EDGE_INSET', 20),
      offsetBottom: envNum('INTERNAL_ASSIST_OFFSET_BOTTOM', 20),
      offsetTop: envNum('INTERNAL_ASSIST_OFFSET_TOP', 20),
      humanSupportPhone: envStr('INTERNAL_ASSIST_HUMAN_PHONE', '+57 313 3174629'),
      borderRadius: envNum('INTERNAL_ASSIST_BORDER_RADIUS', 16),
      theme: 'light',
      autoOpen: false,
      debug: process.env.NODE_ENV === 'development',
    };
  }

  return {
    agentId: envStr('INTERNAL_APP_ASSIST_AGENT_ID', 'math-ais'),
    host,
    color: envStr('INTERNAL_APP_ASSIST_COLOR', '#006B7D'),
    title: envStr('INTERNAL_APP_ASSIST_TITLE', 'Math-ais'),
    subtitle: envStr('INTERNAL_APP_ASSIST_SUBTITLE', 'En linea'),
    welcome: envStr('INTERNAL_APP_ASSIST_WELCOME', 'Hola! Como puedo ayudarte hoy?'),
    fabHint: envStr('INTERNAL_APP_ASSIST_FAB_HINT', '¿Tienes dudas?'),
    avatar: envStr(
      'INTERNAL_APP_ASSIST_AVATAR',
      '/assets/assist/botivaorbe.webp',
    ),
    // Solo WhatsApp por ahora: sin "Hablar con una persona" (inbox/canales).
    humanSupportEnabled: true,
    handoffEnabled: false,
    position: 'bottom-right',
    edgeInset: envNum('INTERNAL_ASSIST_EDGE_INSET', 20),
    offsetBottom: envNum('INTERNAL_ASSIST_OFFSET_BOTTOM', 20),
    offsetTop: envNum('INTERNAL_ASSIST_OFFSET_TOP', 20),
    humanSupportPhone: envStr('INTERNAL_ASSIST_HUMAN_PHONE', '+57 313 3174629'),
    borderRadius: envNum('INTERNAL_ASSIST_BORDER_RADIUS', 16),
    theme: 'light',
    autoOpen: false,
    debug: process.env.NODE_ENV === 'development',
  };
}

export function resolveAssistScriptUrl(origin: string): string {
  const override = process.env.NEXT_PUBLIC_ASSIST_SCRIPT_URL?.trim();
  const base = override || `${origin.replace(/\/$/, '')}/assist.js`;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}v=${WIDGET_SDK_VERSION}`;
}
