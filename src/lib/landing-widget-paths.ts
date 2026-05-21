/**
 * Rutas públicas (landing / marketing) donde se muestra el widget **math** (AgentFlowhub).
 * No incluir /dashboard — allí va **math-ais** (ver `isAppMatiasWidgetPath`). `/admin` queda sin widget.
 */

const EXACT = new Set<string>([
  '/',
  '/es',
  '/en',
  '/pricing',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/widget',
  '/demos',
  '/soluciones',
  '/preguntas-frecuentes',
  '/playground',
  '/politica-de-cookies',
  '/politica-de-privacidad',
  '/politica-de-reembolso',
  '/terminos-y-condiciones',
  '/agents/geoeconomics',
]);

function normalizePathname(pathname: string): string {
  let p = pathname.replace(/\/+$/, '');
  if (p === '') p = '/';
  return p;
}

export function isLandingMarketingPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return EXACT.has(normalizePathname(pathname));
}

/** Panel de usuario: widget **math-ais** (no en /admin ni en widget-preview: colisiona con el widget del usuario). */
export function isAppMatiasWidgetPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname.startsWith('/dashboard/widget-preview')) return false;
  return pathname.startsWith('/dashboard');
}
