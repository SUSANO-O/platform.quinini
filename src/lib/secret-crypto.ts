/**
 * Cifrado simétrico de secretos en reposo (AES-256-GCM).
 *
 * Se usa para guardar credenciales de terceros que el cliente nos confía
 * (p.ej. el access token de WhatsApp Business). Formato del texto cifrado:
 *   v1:<iv_b64>:<tag_b64>:<cipher_b64>
 *
 * Clave: process.env.SECRET_ENCRYPTION_KEY (32 bytes en base64 o hex).
 * Fallback de conveniencia (dev): se deriva por SHA-256 de JWT_SECRET.
 * En producción, define SECRET_ENCRYPTION_KEY explícitamente.
 */
import crypto from 'crypto';

const PREFIX = 'v1';

function resolveKey(): Buffer | null {
  const raw = process.env.SECRET_ENCRYPTION_KEY?.trim();
  if (raw) {
    // Acepta base64 (44 chars) o hex (64 chars) de 32 bytes.
    try {
      const asHex = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
      const buf = asHex || Buffer.from(raw, 'base64');
      if (buf.length === 32) return buf;
    } catch {
      /* cae al fallback */
    }
  }
  const jwt = process.env.JWT_SECRET?.trim();
  if (jwt) {
    // Deriva una clave de 32 bytes determinista del secreto de sesión.
    return crypto.createHash('sha256').update('whatsapp-secret-v1:' + jwt).digest();
  }
  return null;
}

export function isEncryptionAvailable(): boolean {
  return resolveKey() !== null;
}

/** Cifra un texto plano. Lanza si no hay clave disponible. */
export function encryptSecret(plain: string): string {
  const key = resolveKey();
  if (!key) throw new Error('SECRET_ENCRYPTION_KEY_NOT_CONFIGURED');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** Descifra un texto producido por encryptSecret. Devuelve '' si falla. */
export function decryptSecret(payload: string): string {
  const key = resolveKey();
  if (!key || typeof payload !== 'string') return '';
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) return '';
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const enc = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** Devuelve una pista enmascarada para mostrar en UI: "••••••1234". */
export function maskSecret(plain: string): string {
  const s = String(plain || '');
  if (!s) return '';
  const tail = s.slice(-4);
  return '••••••' + tail;
}
