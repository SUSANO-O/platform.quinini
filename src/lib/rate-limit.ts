/**
 * Rate limiter distribuido — Redis (Upstash) con fallback in-memory.
 *
 * Redis se activa si REDIS_URL + REDIS_TOKEN están definidos.
 * Sin ellas cae al Map in-memory (válido solo para instancia única).
 *
 * Setup Upstash (gratis):
 *   1. https://upstash.com → crear base de datos Redis
 *   2. Copiar al .env de la landing:
 *      REDIS_URL=https://xxx.upstash.io
 *      REDIS_TOKEN=AX...
 *
 * Fix de IP spoofing:
 *   - Si TRUSTED_PROXY_COUNT > 0, usamos el N-ésimo IP desde la derecha
 *     en X-Forwarded-For, ignorando los que el cliente puede falsificar.
 *   - Por defecto 1 (un proxy delante: Vercel, Cloudflare, nginx…).
 *   - Pon TRUSTED_PROXY_COUNT=0 solo si la app escucha directamente sin proxy.
 */

import { isLocalDevLimitsBypass } from '@/lib/dev-limits';

// ── Configuración ──────────────────────────────────────────────────────────

const REDIS_URL   = process.env.REDIS_URL?.trim();
const REDIS_TOKEN = process.env.REDIS_TOKEN?.trim();
const USE_REDIS   = Boolean(REDIS_URL && REDIS_TOKEN);

/**
 * Número de proxies de confianza delante de la app.
 * Vercel / Cloudflare / Railway = 1 (valor por defecto).
 * Ajusta con env var TRUSTED_PROXY_COUNT si tu infra es distinta.
 */
const TRUSTED_PROXY_COUNT = Math.max(
  0,
  parseInt(process.env.TRUSTED_PROXY_COUNT || '1', 10) || 1,
);

// ── In-memory fallback ─────────────────────────────────────────────────────

interface Bucket { count: number; resetAt: number }
const store = new Map<string, Bucket>();

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of store) {
      if (b.resetAt <= now) store.delete(k);
    }
  }, 10 * 60_000).unref?.();
}

function inMemoryCheck(
  key: string,
  limit: number,
  windowMs: number,
): { success: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  let b = store.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    store.set(key, b);
  }
  b.count++;
  return {
    success:    b.count <= limit,
    remaining:  Math.max(0, limit - b.count),
    retryAfter: Math.ceil((b.resetAt - now) / 1000),
  };
}

// ── Redis via Upstash REST ─────────────────────────────────────────────────

async function redisCmd(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL!, {
    method:  'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(command),
    signal:  AbortSignal.timeout(3_000),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

async function redisCheck(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ success: boolean; remaining: number; retryAfter: number }> {
  const rk  = `rl:${key}`;
  const sec = Math.ceil(windowMs / 1000);
  try {
    const count = (await redisCmd(['INCR', rk])) as number;
    if (count === 1) await redisCmd(['EXPIRE', rk, sec]);
    const ttl = ((await redisCmd(['TTL', rk])) as number) || sec;
    return {
      success:    count <= limit,
      remaining:  Math.max(0, limit - count),
      retryAfter: Math.max(1, ttl),
    };
  } catch {
    return inMemoryCheck(key, limit, windowMs);
  }
}

// ── Interfaz pública ───────────────────────────────────────────────────────

export async function checkRateLimitAsync(
  namespace: string,
  identifier: string,
  limit: number,
  windowMs = 60_000,
): Promise<{ success: boolean; remaining: number; retryAfter: number }> {
  if (isLocalDevLimitsBypass()) {
    return { success: true, remaining: limit, retryAfter: 0 };
  }
  const key = `${namespace}:${identifier}`;
  if (USE_REDIS) return redisCheck(key, limit, windowMs);
  return inMemoryCheck(key, limit, windowMs);
}

/** Versión sync (in-memory) — para rutas que no pueden ser async en el punto de llamada. */
export function checkRateLimit(
  namespace: string,
  identifier: string,
  limit: number,
  windowMs = 60_000,
): { success: boolean; remaining: number; retryAfter: number } {
  if (isLocalDevLimitsBypass()) {
    return { success: true, remaining: limit, retryAfter: 0 };
  }
  return inMemoryCheck(`${namespace}:${identifier}`, limit, windowMs);
}

// ── IP real del cliente (anti-spoofing) ────────────────────────────────────

/**
 * Extrae la IP real del cliente respetando TRUSTED_PROXY_COUNT.
 *
 * X-Forwarded-For puede ser falsificado por el cliente cuando hay 0 proxies.
 * Con N proxies de confianza, tomamos el N-ésimo valor desde la derecha:
 *   - Los proxies de confianza agregan su IP al final → son los más confiables.
 *   - El cliente controla los valores de la izquierda → los ignoramos si hay proxies.
 *
 * Ejemplo con TRUSTED_PROXY_COUNT=1:
 *   X-Forwarded-For: 1.2.3.4, 10.0.0.1   → IP real: 1.2.3.4  ✓
 *   X-Forwarded-For: SPOOFED, 10.0.0.1    → IP real: SPOOFED  (el proxy no verifica)
 *
 * Para protección total necesitas que el proxy elimine el header del cliente
 * antes de agregar el suyo (Cloudflare/Vercel lo hacen automáticamente).
 */
export function getClientIp(
  req: { headers: { get: (name: string) => string | null } },
): string {
  const xff = req.headers.get('x-forwarded-for');

  if (xff && TRUSTED_PROXY_COUNT > 0) {
    const ips = xff.split(',').map(s => s.trim()).filter(Boolean);
    // Con N proxies de confianza, el cliente está N posiciones desde la derecha
    const idx = Math.max(0, ips.length - TRUSTED_PROXY_COUNT);
    const ip  = ips[idx];
    if (ip) return ip;
  }

  // Sin XFF o sin proxies: intentar X-Real-IP (nginx) o fallback
  return (
    req.headers.get('x-real-ip')?.trim() ||
    (xff ? xff.split(',')[0].trim() : '') ||
    'unknown'
  );
}
