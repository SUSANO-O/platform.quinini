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

/**
 * Returns JWT_SECRET or throws in production if it's missing/insecure.
 * Falls back to a dev placeholder only in non-production environments so
 * local `npm run dev` still works without a full .env file.
 */
function getSessionSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.trim().length === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[auth] JWT_SECRET is not set. Set a strong random secret (min 32 chars) in your environment variables before deploying.',
      );
    }
    // Dev/test fallback — never reaches production
    return 'dev-secret-change-me';
  }

  if (process.env.NODE_ENV === 'production' && secret.trim().length < 32) {
    throw new Error(
      `[auth] JWT_SECRET is too short (${secret.trim().length} chars). Use at least 32 random characters.`,
    );
  }

  return secret.trim();
}

/** Simple session token: base64url(userId:timestamp:hmac) */
export function createSessionToken(userId: string): string {
  const secret = getSessionSecret();
  const payload = `${userId}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

export function verifySessionToken(token: string): string | null {
  try {
    const secret = getSessionSecret();
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

/** Igual que la API de sesión: sin campo o null se trata como verificado (cuentas legacy). */
export function isUserEmailVerified(user: { emailVerified?: boolean | null } | null | undefined): boolean {
  if (!user) return false;
  return user.emailVerified ?? true;
}

type CookieGetter = { get: (name: string) => { value: string } | undefined };

/** Suplantación activa con cookie firmada válida: el admin opera la cuenta (sin bloqueo por email). */
export function isImpersonationSession(cookies: CookieGetter): boolean {
  const imp = cookies.get(IMPERSONATOR_COOKIE)?.value;
  return Boolean(imp && verifySessionToken(imp));
}

// ── Password strength validation ─────────────────────────────────────────────

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwerty1', 'iloveyou', 'admin123', 'letmein1', 'welcome1',
  'monkey123', 'dragon12', 'master12', 'sunshine', 'princess', 'football',
  'superman', 'michael1', 'shadow12', 'jessica1', 'michelle', 'charlie1',
  'baseball', 'batman12', 'trustno1', 'starwars', 'abc12345', 'passw0rd',
  'contraseña', 'contraseña1', 'colombia', 'mexico123', 'argentina',
]);

/**
 * Returns null if the password is strong enough, or a Spanish error string.
 * Rules: min 8 chars, lowercase + uppercase + (digit or special char), not in common-password blocklist.
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres.';
  }
  if (!/[a-z]/.test(password)) {
    return 'La contraseña debe contener al menos una letra minúscula.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'La contraseña debe contener al menos una letra mayúscula.';
  }
  if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return 'La contraseña debe contener al menos un número o carácter especial.';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'Esa contraseña es demasiado común. Elige una más segura.';
  }
  return null;
}

// ── Secure random tokens (email verify, password reset) ───────────────────────

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ── Two-Factor Authentication (TOTP) ─────────────────────────────────────────

/**
 * Signed short-lived token used between password-OK and TOTP-OK steps.
 * Format: base64url(userId:expiry:hmac) — same approach as session token.
 */
export function createTwoFactorPendingToken(userId: string): string {
  const secret = getSessionSecret();
  const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes
  const payload = `2fa:${userId}:${expiry}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

export function verifyTwoFactorPendingToken(token: string): string | null {
  try {
    const secret = getSessionSecret();
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    // parts: ['2fa', userId, expiry, hmac]
    if (parts.length < 4 || parts[0] !== '2fa') return null;
    const hmac = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(':');
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (hmac.length !== expected.length) return null;
    const valid = crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'));
    if (!valid) return null;
    const expiry = parseInt(parts[2], 10);
    if (Date.now() > expiry) return null;
    return parts[1]; // userId
  } catch {
    return null;
  }
}

// ── Landing access lock (código admin por cuenta) ───────────────────────────

export const LANDING_UNLOCK_COOKIE = 'afhub_landing_unlock';
const LANDING_UNLOCK_MAX_AGE_MS = 60 * 60 * 12 * 1000; // 12 h, alineado con sesión

/** Token entre password/2FA OK y código de acceso landing OK. */
export function createLandingAccessPendingToken(userId: string): string {
  const secret = getSessionSecret();
  const expiry = Date.now() + 10 * 60 * 1000;
  const payload = `landing:${userId}:${expiry}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

export function verifyLandingAccessPendingToken(token: string): string | null {
  try {
    const secret = getSessionSecret();
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 4 || parts[0] !== 'landing') return null;
    const hmac = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(':');
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (hmac.length !== expected.length) return null;
    const valid = crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'));
    if (!valid) return null;
    const expiry = parseInt(parts[2]!, 10);
    if (Date.now() > expiry) return null;
    return parts[1]!;
  } catch {
    return null;
  }
}

export function createLandingUnlockToken(userId: string, codeVersion: number): string {
  const secret = getSessionSecret();
  const expiry = Date.now() + LANDING_UNLOCK_MAX_AGE_MS;
  const payload = `landing-unlock:${userId}:${codeVersion}:${expiry}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

export function verifyLandingUnlockToken(token: string): { userId: string; codeVersion: number } | null {
  try {
    const secret = getSessionSecret();
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 5 || parts[0] !== 'landing-unlock') return null;
    const hmac = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(':');
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (hmac.length !== expected.length) return null;
    const valid = crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'));
    if (!valid) return null;
    const expiry = parseInt(parts[3]!, 10);
    if (Date.now() > expiry) return null;
    return { userId: parts[1]!, codeVersion: parseInt(parts[2]!, 10) || 0 };
  } catch {
    return null;
  }
}

export function landingUnlockMatchesUser(
  cookies: CookieGetter,
  userId: string,
  codeVersion: number,
): boolean {
  const token = cookies.get(LANDING_UNLOCK_COOKIE)?.value;
  if (!token) return false;
  const parsed = verifyLandingUnlockToken(token);
  return parsed?.userId === userId && parsed.codeVersion === codeVersion;
}

/** Hash del código de 6 dígitos para cambio de email (comparación segura en servidor). */
export function hashEmailChangeCode(code: string, userId: string): string {
  const secret = getSessionSecret();
  const normalized = code.replace(/\s/g, '');
  return crypto.createHash('sha256').update(`${normalized}:${userId}:${secret}`).digest('hex');
}

/** Genera un código numérico de 6 dígitos para verificación por email. */
export function generateEmailChangeCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

// ── Widget Share ──────────────────────────────────────────────────────────────

const SHARE_ID_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHARE_PW_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Genera un shareId único de 12 caracteres (URL-safe). */
export function generateShareId(): string {
  return Array.from(crypto.randomBytes(12))
    .map(b => SHARE_ID_CHARS[b % SHARE_ID_CHARS.length])
    .join('');
}

/** Genera una contraseña legible de 10 caracteres (sin confusibles). */
export function generateSharePassword(): string {
  const raw = Array.from(crypto.randomBytes(10))
    .map(b => SHARE_PW_CHARS[b % SHARE_PW_CHARS.length])
    .join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 7)}-${raw.slice(7)}`;
}

/** Calcula la fecha de expiración de un share según su duración configurada. */
export function computeShareExpiresAt(value: number, unit: 'hours' | 'days' | 'weeks' | 'months'): Date {
  const msMap: Record<string, number> = {
    hours:  3_600_000,
    days:   86_400_000,
    weeks:  604_800_000,
    months: 2_592_000_000,
  };
  return new Date(Date.now() + value * (msMap[unit] ?? 3_600_000));
}

/** Crea un token de sesión para un share. maxAgeMs por defecto: 8 h (mín. share). */
export function createShareSessionToken(shareId: string, maxAgeMs = 8 * 60 * 60 * 1000): string {
  const secret  = getSessionSecret();
  const expiry   = Date.now() + maxAgeMs;
  const payload  = `share:${shareId}:${expiry}`;
  const sig      = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

/** Verifica un token de sesión de share. Devuelve el shareId o null. */
export function verifyShareSessionToken(token: string): string | null {
  try {
    const secret  = getSessionSecret();
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts   = decoded.split(':');
    if (parts.length !== 4 || parts[0] !== 'share') return null;
    const [, shareId, expiryStr, sig] = parts;
    if (Date.now() > Number(expiryStr)) return null;
    const payload  = `share:${shareId}:${expiryStr}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return shareId;
  } catch {
    return null;
  }
}
