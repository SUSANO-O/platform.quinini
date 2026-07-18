/** URL local del servicio agent-flow-api (docs + REST /api/v1). */
export const AGENTFLOW_API_LOCAL_URL = 'http://127.0.0.1:4000';

/** URL pública de producción (Cloud Run). */
export const AGENTFLOW_API_PRODUCTION_URL =
  'https://api-rest-agent-flow-528082765109.europe-west1.run.app';

export const AGENTFLOW_API_ORIGINS = [
  AGENTFLOW_API_LOCAL_URL,
  'http://localhost:4000',
  AGENTFLOW_API_PRODUCTION_URL,
] as const;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function isLocalLandingHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local');
}

function isLocalApiUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return false;
  }
}

function explicitAgentflowApiUrl(): string {
  if (typeof process === 'undefined') return '';
  return process.env.NEXT_PUBLIC_AGENTFLOW_API_URL?.trim() ?? '';
}

function isProductionDeploy(): boolean {
  if (typeof process === 'undefined') return false;
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

/**
 * Resuelve la URL del API REST según dónde corre la landing:
 * - localhost / 127.0.0.1 → API local (:4000)
 * - botiva.space y demás despliegues → API de producción
 *
 * NEXT_PUBLIC_AGENTFLOW_API_URL solo aplica en desarrollo si apunta a un host
 * distinto de localhost (p. ej. staging). En producción nunca usa localhost del .env.
 */
export function resolveAgentflowApiUrl(opts?: { landingHostname?: string | null }): string {
  const explicit = explicitAgentflowApiUrl();
  const hostname =
    opts?.landingHostname ??
    (typeof window !== 'undefined' ? window.location.hostname : null);

  if (hostname) {
    if (isLocalLandingHost(hostname)) return AGENTFLOW_API_LOCAL_URL;
    return AGENTFLOW_API_PRODUCTION_URL;
  }

  if (isProductionDeploy()) {
    if (explicit && !isLocalApiUrl(explicit)) return stripTrailingSlash(explicit);
    return AGENTFLOW_API_PRODUCTION_URL;
  }

  if (explicit) return stripTrailingSlash(explicit);
  return AGENTFLOW_API_LOCAL_URL;
}

/** URL pública del servicio agent-flow-api (documentación + REST /api/v1). */
export function getAgentflowApiUrl(): string {
  return resolveAgentflowApiUrl();
}

/** Prefijo same-origin para embeber docs del API REST sin cookies third-party. */
export const AGENTFLOW_API_EMBED_PREFIX = '/api/embed/afapi';

export function getAgentflowApiDocsEmbedUrl(sessionToken?: string, origin?: string): string {
  const base = `${AGENTFLOW_API_EMBED_PREFIX}/docs/`;
  const path = sessionToken
    ? `${base}?session=${encodeURIComponent(sessionToken)}`
    : base;
  if (!origin) return path;
  return `${origin.replace(/\/$/, '')}${path}`;
}

export function getAgentflowApiDocsUrl(): string {
  return `${getAgentflowApiUrl()}/docs/`;
}

export function getAgentflowApiOriginsForCsp(): string[] {
  const origins = new Set<string>(AGENTFLOW_API_ORIGINS.map((u) => new URL(u).origin));
  const explicit = explicitAgentflowApiUrl();
  if (explicit && !isLocalApiUrl(explicit)) {
    try {
      origins.add(new URL(explicit).origin);
    } catch {
      /* noop */
    }
  }
  return [...origins];
}
