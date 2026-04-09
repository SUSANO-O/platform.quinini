import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// ── Password hashing ──────────────────────────────────────────────────────────
// v1 = SHA256 (legacy, auto-upgraded on login)
// v2 = bcrypt rounds=12 (current)

const BCRYPT_ROUNDS = 12;

/** Hash a new password with bcrypt */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Legacy SHA256 — only kept for migration */
export function hashPasswordLegacy(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Verify a password against its stored hash.
 * Returns { valid, needsUpgrade } — if needsUpgrade is true, caller should
 * rehash with bcrypt and save the new hash + hashVersion='v2-bcrypt'.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  hashVersion: string | null | undefined,
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (!hashVersion || hashVersion === 'v1-sha256') {
    // Legacy path: compare SHA256
    const sha = hashPasswordLegacy(password);
    const valid = sha === storedHash;
    return { valid, needsUpgrade: valid }; // upgrade on successful login
  }
  // v2-bcrypt
  const valid = await bcrypt.compare(password, storedHash);
  return { valid, needsUpgrade: false };
}

// ── Session tokens ────────────────────────────────────────────────────────────

/** Simple session token: base64url(userId:timestamp:hmac) */
export function createSessionToken(userId: string): string {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  const payload = `${userId}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

export function verifySessionToken(token: string): string | null {
  try {
    const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 3) return null;

    const hmac = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(':');
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (hmac.length !== expected.length) return null;
    const valid = crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'));
    if (!valid) return null;

    return parts[0]; // userId
  } catch {
    return null;
  }
}

/** Cookie httpOnly: token del admin que inició suplantación (misma forma que sesión). */
export const IMPERSONATOR_COOKIE = 'afhub_impersonator';

// ── Secure random tokens (email verify, password reset) ───────────────────────

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Hash del código de 6 dígitos para cambio de email (comparación segura en servidor). */
export function hashEmailChangeCode(code: string, userId: string): string {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  const normalized = code.replace(/\s/g, '');
  return crypto.createHash('sha256').update(`${normalized}:${userId}:${secret}`).digest('hex');
}

/** Genera un código numérico de 6 dígitos para verificación por email. */
export function generateEmailChangeCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}
