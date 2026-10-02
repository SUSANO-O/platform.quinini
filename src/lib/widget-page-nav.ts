/**
 * Página actual y navegación para widgets de clientes (cualquier web, no solo el panel BotIvA).
 *
 * - `pageContextLine`: le dice al agente en qué vista está el cliente (ruta, parámetros no
 *   sensibles y pestaña #).
 * - `finalizeWidgetNavReply`: si el agente propone llevar al cliente a otra vista con un bloque
 *   ```assist-nav {path, onDecline, afterNavigate}```, lo convierte en `navOffer` (botones Sí/No
 *   del widget) y lo quita del texto. Solo rutas relativas del mismo sitio: nunca otro dominio.
 *
 * El asistente interno de BotIvA sigue con su propio pipeline (`assist-agent-navigation.ts`).
 */

export type WidgetNavOffer = {
  path: string;
  onDecline: string;
  afterNavigate?: string;
  prompt?: string;
};

const NAV_BLOCK_RE = /```assist-nav\s*\n?([\s\S]*?)```/gi;
const NAV_XML_RE = /<assist-nav[\w-]*[\s\S]*?(?:\/>|<\/assist-nav[\w-]*>)/gi;
const MAX_PATH = 200;
const DEFAULT_DECLINE = 'De acuerdo, puedes ir cuando quieras desde el menú.';

/** Parámetros que nunca deben llegar al modelo (credenciales, sesiones, firmas). */
export const SENSITIVE_PARAM_RE = /token|secret|pass|pwd|sig|session|jwt|auth|key|cookie|otp|code/i;
const SAFE_VALUE_RE = /^[A-Za-z0-9_\-.:@ ]{0,80}$/;

/**
 * Ruta + parámetros no sensibles + pestaña (#). La pestaña y el dispositivo (p. ej.
 * `visorDisp.php?k_disp=…#routes-day`) son justo lo que el agente necesita saber.
 */
function toPageRef(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  let url: URL;
  try {
    if (/^https?:\/\//i.test(v)) url = new URL(v);
    else if (v.startsWith('/') && !v.startsWith('//')) url = new URL(v, 'https://x.invalid');
    else return '';
  } catch {
    return '';
  }
  const path = url.pathname;
  if (!/^\/[A-Za-z0-9_\-./]*$/.test(path)) return '';
  const params: string[] = [];
  url.searchParams.forEach((value, key) => {
    if (SENSITIVE_PARAM_RE.test(key) || !/^[A-Za-z0-9_\-]{1,40}$/.test(key) || !SAFE_VALUE_RE.test(value)) return;
    params.push(`${key}=${value}`);
  });
  const hash = url.hash && /^#[A-Za-z0-9_\-]{1,60}$/.test(url.hash) ? url.hash : '';
  return path + (params.length ? `?${params.join('&')}` : '') + hash;
}

/** Línea de contexto para el agente; vacía si no hay una ruta utilizable. */
export function pageContextLine(pagePath: string | undefined | null): string {
  const ref = toPageRef(String(pagePath ?? ''));
  if (!ref || ref.length > MAX_PATH) return '';
  return `Página actual del cliente en la app: ${ref}`;
}

/** Ruta relativa del mismo sitio, sin esquema ni host ni caracteres raros. */
export function isSafeSameSitePath(path: string): boolean {
  if (typeof path !== 'string' || !path || path.length > MAX_PATH) return false;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return false;
  return /^\/[A-Za-z0-9_\-./?=&%#]*$/.test(path);
}

function cleanText(v: unknown, max = 300): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

export function stripWidgetNavBlocks(reply: string): string {
  return String(reply ?? '')
    .replace(NAV_BLOCK_RE, '')
    .replace(NAV_XML_RE, '')
    .trim();
}

export function finalizeWidgetNavReply(rawReply: string): { reply: string; navOffer?: WidgetNavOffer } {
  const raw = String(rawReply ?? '');
  NAV_BLOCK_RE.lastIndex = 0;
  const m = NAV_BLOCK_RE.exec(raw);
  NAV_BLOCK_RE.lastIndex = 0;
  if (!m) {
    if (!NAV_XML_RE.test(raw)) return { reply: raw };
    NAV_XML_RE.lastIndex = 0;
    return { reply: stripWidgetNavBlocks(raw) };
  }
  const reply = stripWidgetNavBlocks(raw);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(m[1].trim()) as Record<string, unknown>;
  } catch {
    return { reply };
  }
  const path = typeof parsed.path === 'string' ? parsed.path.trim() : '';
  if (!isSafeSameSitePath(path)) return { reply };
  const afterNavigate = cleanText(parsed.afterNavigate ?? parsed.onAccept);
  const prompt = cleanText(parsed.prompt, 160);
  return {
    reply,
    navOffer: {
      path,
      onDecline: cleanText(parsed.onDecline ?? parsed.declineHint) ?? DEFAULT_DECLINE,
      ...(afterNavigate ? { afterNavigate } : {}),
      ...(prompt ? { prompt } : {}),
    },
  };
}
