/**
 * Configuración del asistente interno (dashboard + marketing).
 * Valores por defecto; override vía env en servidor.
 */

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
  borderRadius: number;
  theme: 'light' | 'dark';
  autoOpen: boolean;
  debug: boolean;
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
  const host = envStr('NEXT_PUBLIC_APP_URL', requestOrigin).replace(/\/$/, '') || requestOrigin;

  if (context === 'marketing') {
    return {
      agentId: envStr('INTERNAL_MARKETING_ASSIST_AGENT_ID', 'math'),
      host,
      color: envStr('INTERNAL_MARKETING_ASSIST_COLOR', '#f5540f'),
      title: envStr('INTERNAL_MARKETING_ASSIST_TITLE', 'Math'),
      subtitle: envStr('INTERNAL_MARKETING_ASSIST_SUBTITLE', 'En linea'),
      welcome: envStr('INTERNAL_MARKETING_ASSIST_WELCOME', 'Hola! Como puedo ayudarte hoy?'),
      fabHint: envStr('INTERNAL_MARKETING_ASSIST_FAB_HINT', 'preguntame lo que necesites'),
      avatar: envStr(
        'INTERNAL_MARKETING_ASSIST_AVATAR',
        'https://img.freepik.com/premium-photo/bright-blue-orb_303714-30852.jpg',
      ),
      position: 'bottom-right',
      edgeInset: envNum('INTERNAL_ASSIST_EDGE_INSET', 20),
      offsetBottom: envNum('INTERNAL_ASSIST_OFFSET_BOTTOM', 20),
      offsetTop: envNum('INTERNAL_ASSIST_OFFSET_TOP', 20),
      humanSupportPhone: envStr('INTERNAL_ASSIST_HUMAN_PHONE', '+57 3196748729'),
      borderRadius: envNum('INTERNAL_ASSIST_BORDER_RADIUS', 16),
      theme: 'light',
      autoOpen: false,
      debug: process.env.NODE_ENV === 'development',
    };
  }

  return {
    agentId: envStr('INTERNAL_APP_ASSIST_AGENT_ID', 'math-ais'),
    host,
    color: envStr('INTERNAL_APP_ASSIST_COLOR', '#fb0e0e'),
    title: envStr('INTERNAL_APP_ASSIST_TITLE', 'Math-ais'),
    subtitle: envStr('INTERNAL_APP_ASSIST_SUBTITLE', 'En linea'),
    welcome: envStr('INTERNAL_APP_ASSIST_WELCOME', 'Hola! Como puedo ayudarte hoy?'),
    fabHint: envStr('INTERNAL_APP_ASSIST_FAB_HINT', '¿tienes duda en el uso?'),
    position: 'bottom-right',
    edgeInset: envNum('INTERNAL_ASSIST_EDGE_INSET', 20),
    offsetBottom: envNum('INTERNAL_ASSIST_OFFSET_BOTTOM', 20),
    offsetTop: envNum('INTERNAL_ASSIST_OFFSET_TOP', 20),
    humanSupportPhone: envStr('INTERNAL_ASSIST_HUMAN_PHONE', '+57 3196748729'),
    borderRadius: envNum('INTERNAL_ASSIST_BORDER_RADIUS', 16),
    theme: 'light',
    autoOpen: false,
    debug: process.env.NODE_ENV === 'development',
  };
}

export function resolveAssistScriptUrl(origin: string): string {
  const override = process.env.NEXT_PUBLIC_ASSIST_SCRIPT_URL?.trim();
  if (override) return override;
  return `${origin.replace(/\/$/, '')}/assist.js`;
}
