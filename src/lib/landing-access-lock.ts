import crypto from 'crypto';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateLandingAccessCode(length = 6): string {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return code;
}

export function normalizeLandingAccessCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function hashLandingAccessCode(code: string, userId: string, secret: string): string {
  const normalized = normalizeLandingAccessCode(code);
  return crypto
    .createHmac('sha256', secret)
    .update(`landing-access:${userId}:${normalized}`)
    .digest('hex');
}

export function verifyLandingAccessCode(
  code: string,
  storedHash: string | null | undefined,
  userId: string,
  secret: string,
): boolean {
  if (!storedHash) return false;
  const expected = hashLandingAccessCode(code, userId, secret);
  if (expected.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(storedHash, 'hex'));
}

export function isValidLandingAccessCodeFormat(code: string): boolean {
  const normalized = normalizeLandingAccessCode(code);
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4,12}$/.test(normalized);
}
