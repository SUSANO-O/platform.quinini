/**
 * Bypass de límites técnicos en desarrollo local (npm run dev, Docker con DISABLE_RATE_LIMITS).
 * Nunca aplica en NODE_ENV=production salvo DISABLE_RATE_LIMITS explícito en .env local.
 */

export function isLocalDevLimitsBypass(): boolean {
  if (process.env.FORCE_RATE_LIMITS === '1' || process.env.FORCE_RATE_LIMITS === 'true') {
    return false;
  }
  if (process.env.DISABLE_RATE_LIMITS === '1' || process.env.DISABLE_RATE_LIMITS === 'true') {
    return true;
  }
  return process.env.NODE_ENV === 'development';
}
