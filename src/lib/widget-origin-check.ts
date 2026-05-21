/**
 * Valida si el origen de una petición está en la allowlist del widget.
 *
 * Reglas:
 * - Si allowedOrigins está vacío → se acepta cualquier origen (modo dev / sin restricción).
 * - La comparación es exacta sobre scheme+host (normalizado lowercase, sin trailing slash).
 * - Se acepta siempre si el origin es el propio NEXT_PUBLIC_APP_URL (dashboard interno).
 * - Se acepta siempre para requests sin origen (server-to-server, herramientas CLI).
 */

const APP_ORIGIN = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_APP_URL?.trim();
    return url ? new URL(url).origin.toLowerCase() : '';
  } catch {
    return '';
  }
})();

function normalizeOrigin(raw: string): string {
  try {
    return new URL(raw).origin.toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/\/$/, '');
  }
}

export function isOriginAllowed(
  requestOrigin: string | null,
  allowedOrigins: string[],
): boolean {
  // No origin header → request server-side o herramienta CLI → permitir
  if (!requestOrigin) return true;

  const normalized = normalizeOrigin(requestOrigin);

  // El propio dashboard siempre puede llamar al chat (vista previa, test interno)
  if (APP_ORIGIN && normalized === APP_ORIGIN) return true;

  // Apps locales (PHP en :9090, etc.) — pruebas de embed del widget
  if (isLocalhostOrigin(requestOrigin)) return true;

  // Lista vacía → modo permisivo (widget sin restricción de dominio)
  if (!allowedOrigins.length) return true;

  return allowedOrigins.some(o => normalizeOrigin(o) === normalized);
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const h = new URL(origin).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Genera el valor correcto de Access-Control-Allow-Origin:
 * - Si el origin está permitido → devuelve ese origin (para que el browser envíe cookies).
 * - Si no → devuelve 'null' (bloquea la respuesta desde el browser).
 */
export function resolveAllowOrigin(
  requestOrigin: string | null,
  allowedOrigins: string[],
): string {
  if (isOriginAllowed(requestOrigin, allowedOrigins)) {
    return requestOrigin || '*';
  }
  return 'null';
}
