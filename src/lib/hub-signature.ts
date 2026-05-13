/**
 * Firma HMAC-SHA256 para comunicación landing → AgentFlowhub.
 *
 * En lugar de enviar HUB_TO_LANDING_SECRET en texto plano en cada header
 * (que quedaría expuesto en logs del hub), firmamos un timestamp + hash del body.
 *
 * Header generado: X-Landing-Signature: t=<epoch>;sha256=<hmac>
 * Algoritmo: HMAC-SHA256( "<epoch>.<bodyHash>" , secret )
 * donde bodyHash = SHA256(rawBody) en hex
 *
 * El hub verifica:
 *   1. Que el timestamp no tenga más de SIGNATURE_MAX_AGE_SEC de antigüedad.
 *   2. Que el HMAC coincida con el body recibido.
 *
 * Con esto, aunque alguien intercepte el header, la firma expira en 5 minutos
 * y no sirve para replay attacks.
 */

import crypto from 'crypto';

export const SIGNATURE_HEADER = 'X-Landing-Signature';
export const SIGNATURE_MAX_AGE_SEC = 300; // 5 minutos

/**
 * Genera el valor del header X-Landing-Signature para un body dado.
 */
export function signRequest(rawBody: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const payload = `${t}.${bodyHash}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${t};sha256=${sig}`;
}

/**
 * Verifica el header X-Landing-Signature en el lado del hub.
 * Devuelve true si la firma es válida y no ha expirado.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(';').map(p => {
      const eq = p.indexOf('=');
      return eq === -1 ? [p, ''] : [p.slice(0, eq), p.slice(eq + 1)];
    }),
  );

  const t = parseInt(parts['t'] || '0', 10);
  const received = parts['sha256'] || '';
  if (!t || !received) return false;

  const age = Math.floor(Date.now() / 1000) - t;
  if (age < 0 || age > SIGNATURE_MAX_AGE_SEC) return false;

  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${bodyHash}`)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}
