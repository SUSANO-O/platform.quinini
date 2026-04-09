/**
 * Simple in-memory rate limiter using token bucket algorithm.
 * Works for single-instance deployments (Vercel serverless, Railway, etc.).
 * For multi-instance: swap the Map for a Redis-backed store.
 *
 * Usage:
 *   const { success, remaining, retryAfter } = checkRateLimit('login', ip, 5, 60_000);
 *   if (!success) return NextResponse.json({ error: 'Demasiados intentos.' }, { status: 429 });
 */

interface Bucket {
  count: number;
  resetAt: number;
}

// Module-level store — persists across requests in the same process
const store = new Map<string, Bucket>();

// Cleanup stale entries every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of store.entries()) {
      if (bucket.resetAt <= now) store.delete(key);
    }
  }, 10 * 60 * 1000);
}

/**
 * @param namespace  e.g. 'login', 'register', 'checkout'
 * @param identifier IP address or userId
 * @param limit      Max requests per window
 * @param windowMs   Window duration in milliseconds
 */
export function checkRateLimit(
  namespace: string,
  identifier: string,
  limit: number,
  windowMs: number,
): { success: boolean; remaining: number; retryAfter: number } {
  const key = `${namespace}:${identifier}`;
  const now = Date.now();

  let bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    store.set(key, bucket);
  }

  bucket.count++;
  const remaining = Math.max(0, limit - bucket.count);
  const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);

  return {
    success: bucket.count <= limit,
    remaining,
    retryAfter,
  };
}

/** Get the real client IP from Next.js request headers */
export function getClientIp(req: { headers: { get: (name: string) => string | null } }): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
