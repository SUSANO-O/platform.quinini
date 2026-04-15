/**
 * Caché cliente de GET /api/subscription (sessionStorage, por usuario).
 * Evita una ráfaga de peticiones al navegar el dashboard (cada página montaba el mismo estado).
 * No sustituye al servidor: TTL corto; invalidar con `force` tras checkout / facturación.
 */

const PREFIX = 'af_sub_v1:';

/** Tiempo de vida de la caché (ms). Pasado este tiempo se vuelve a pedir al servidor. */
export const SUBSCRIPTION_CACHE_TTL_MS = 10 * 60 * 1000;

type CachedEnvelope = {
  t: number;
  v: unknown;
};

export function readSubscriptionSessionCache(userId: string): {
  data: unknown;
  stale: boolean;
} | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEnvelope;
    if (!parsed || typeof parsed.t !== 'number') return null;
    const age = Date.now() - parsed.t;
    return { data: parsed.v, stale: age > SUBSCRIPTION_CACHE_TTL_MS };
  } catch {
    return null;
  }
}

export function writeSubscriptionSessionCache(userId: string, data: unknown): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    sessionStorage.setItem(PREFIX + userId, JSON.stringify({ t: Date.now(), v: data }));
  } catch {
    /* quota / private mode */
  }
}

export function clearSubscriptionSessionCache(userId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (userId) {
      sessionStorage.removeItem(PREFIX + userId);
      return;
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* noop */
  }
}
