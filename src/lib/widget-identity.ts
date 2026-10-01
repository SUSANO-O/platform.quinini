/**
 * Identidad firmada del cliente final para el widget (protocolo v1).
 *
 * La app de la empresa (servidor) firma quién es el usuario logueado y el widget reenvía
 * esa firma. Solo si la firma es válida con el secreto del widget, la landing pasa
 * `verifiedIdentity` al hub (el MCP MySQL la usa como filtro obligatorio por cliente).
 *
 *   firma = HMAC-SHA256(secreto, "v1.<ts>.<k1=v1&k2=v2…>")
 *
 * Claims ordenados por clave y codificados como `rawurlencode` de PHP (RFC 3986), así
 * el snippet PHP de la empresa y esta verificación producen exactamente la misma cadena.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export type SignedWidgetIdentity = {
  claims: Record<string, string>;
  ts: number;
  sig: string;
};

export type VerifyIdentityResult =
  | { ok: true; claims: Record<string, string> }
  | { ok: false; reason: string };

/** Validez máxima de una firma (la página se recarga y vuelve a firmar). */
export const IDENTITY_MAX_AGE_SEC = 12 * 3600;
/** Tolerancia de reloj hacia el futuro. */
const CLOCK_SKEW_SEC = 300;
const MAX_CLAIMS = 10;
const CLAIM_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const MAX_CLAIM_VALUE_LEN = 128;

/** Igual que PHP `rawurlencode` (RFC 3986: solo A-Z a-z 0-9 - _ . ~ sin codificar). */
export function rawUrlEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function canonicalIdentityString(claims: Record<string, string>, ts: number): string {
  const body = Object.keys(claims)
    .sort()
    .map((k) => `${rawUrlEncode(k)}=${rawUrlEncode(claims[k])}`)
    .join('&');
  return `v1.${ts}.${body}`;
}

export function signWidgetIdentity(
  claims: Record<string, string>,
  secret: string,
  ts: number = Math.floor(Date.now() / 1000),
): SignedWidgetIdentity {
  const sig = createHmac('sha256', secret).update(canonicalIdentityString(claims, ts)).digest('hex');
  return { claims, ts, sig };
}

export function verifyWidgetIdentity(
  raw: unknown,
  secret: string | null | undefined,
  nowSec: number = Math.floor(Date.now() / 1000),
): VerifyIdentityResult {
  if (!secret || secret.length < 32) return { ok: false, reason: 'widget_sin_secreto' };
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'formato' };
  const { claims, ts, sig } = raw as Record<string, unknown>;

  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return { ok: false, reason: 'claims' };
  const entries = Object.entries(claims as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_CLAIMS) return { ok: false, reason: 'claims' };
  const clean: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!CLAIM_KEY_RE.test(k)) return { ok: false, reason: 'claims' };
    if (typeof v !== 'string' || !v.trim() || v.length > MAX_CLAIM_VALUE_LEN) return { ok: false, reason: 'claims' };
    clean[k] = v;
  }

  if (typeof ts !== 'number' || !Number.isInteger(ts)) return { ok: false, reason: 'ts' };
  if (ts > nowSec + CLOCK_SKEW_SEC) return { ok: false, reason: 'ts_futuro' };
  if (nowSec - ts > IDENTITY_MAX_AGE_SEC) return { ok: false, reason: 'expirada' };

  if (typeof sig !== 'string' || !/^[a-f0-9]{64}$/i.test(sig)) return { ok: false, reason: 'firma' };
  const expected = createHmac('sha256', secret).update(canonicalIdentityString(clean, ts)).digest();
  const given = Buffer.from(sig, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'firma' };
  }
  return { ok: true, claims: clean };
}

/**
 * Separa la identidad del cuerpo del chat. Siempre elimina `verifiedIdentity` (solo el
 * servidor puede ponerla) e `identity` (se verifica aparte). Devuelve el cuerpo limpio.
 */
export function extractIdentityFromChatBody(rawBody: string): { body: string; identity: unknown } {
  try {
    const j = JSON.parse(rawBody) as Record<string, unknown>;
    if (!j || typeof j !== 'object') return { body: rawBody, identity: undefined };
    const identity = j.identity;
    if (!('identity' in j) && !('verifiedIdentity' in j)) return { body: rawBody, identity: undefined };
    delete j.identity;
    delete j.verifiedIdentity;
    return { body: JSON.stringify(j), identity };
  } catch {
    return { body: rawBody, identity: undefined };
  }
}

/** Añade la identidad ya verificada al cuerpo que se reenvía al hub. */
export function injectVerifiedIdentity(rawBody: string, claims: Record<string, string>): string {
  try {
    const j = JSON.parse(rawBody) as Record<string, unknown>;
    j.verifiedIdentity = claims;
    return JSON.stringify(j);
  } catch {
    return rawBody;
  }
}
