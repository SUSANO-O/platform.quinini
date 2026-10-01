import { describe, expect, it } from 'vitest';
import {
  canonicalIdentityString,
  extractIdentityFromChatBody,
  injectVerifiedIdentity,
  rawUrlEncode,
  signWidgetIdentity,
  verifyWidgetIdentity,
} from '@/lib/widget-identity';

const SECRET = 'k'.repeat(40);
const NOW = 1_790_000_000;

/**
 * Vector generado con PHP 8.3 real (`docker run php:8.3-cli`) usando el snippet que se
 * entrega a las empresas (ksort + rawurlencode + hash_hmac). Si esto falla, el PHP de los
 * clientes y la landing dejan de producir la misma firma.
 */
const PHP_VECTOR = {
  claims: { cliente: '1000000001', empresa: 'demo-gps', nombre: 'José Pérez (ñ)! ~*' },
  ts: 1_790_000_000,
  sig: '489c2b4ec9ef7132941cdf728db1a2ef8cfcb28b8bd0026fc81581bb9d5589c0',
};

describe('widget identity v1', () => {
  it('coincide byte a byte con la firma generada por PHP', () => {
    expect(verifyWidgetIdentity(PHP_VECTOR, SECRET, NOW)).toEqual({ ok: true, claims: PHP_VECTOR.claims });
    expect(signWidgetIdentity(PHP_VECTOR.claims, SECRET, PHP_VECTOR.ts).sig).toBe(PHP_VECTOR.sig);
  });

  it('rawUrlEncode replica rawurlencode de PHP (RFC 3986)', () => {
    expect(rawUrlEncode("José (ñ)! ~*'")).toBe('Jos%C3%A9%20%28%C3%B1%29%21%20~%2A%27');
  });

  it('el orden de los claims no cambia la firma', () => {
    expect(canonicalIdentityString({ b: '2', a: '1' }, 5)).toBe('v1.5.a=1&b=2');
  });

  it('rechaza firma alterada o claims cambiados (otro cliente)', () => {
    const forged = { ...PHP_VECTOR, claims: { ...PHP_VECTOR.claims, cliente: '1000000002' } };
    expect(verifyWidgetIdentity(forged, SECRET, NOW)).toEqual({ ok: false, reason: 'firma' });
    const badSig = { ...PHP_VECTOR, sig: '0'.repeat(64) };
    expect(verifyWidgetIdentity(badSig, SECRET, NOW)).toMatchObject({ ok: false, reason: 'firma' });
  });

  it('rechaza con otro secreto', () => {
    expect(verifyWidgetIdentity(PHP_VECTOR, 'x'.repeat(40), NOW)).toMatchObject({ ok: false, reason: 'firma' });
  });

  it('caduca a las 12 h y no acepta fechas del futuro', () => {
    expect(verifyWidgetIdentity(PHP_VECTOR, SECRET, NOW + 12 * 3600 + 1)).toMatchObject({ reason: 'expirada' });
    expect(verifyWidgetIdentity(PHP_VECTOR, SECRET, NOW - 301)).toMatchObject({ reason: 'ts_futuro' });
  });

  it('sin secreto en el widget nunca verifica', () => {
    expect(verifyWidgetIdentity(PHP_VECTOR, null, NOW)).toMatchObject({ ok: false, reason: 'widget_sin_secreto' });
    expect(verifyWidgetIdentity(PHP_VECTOR, 'corto', NOW)).toMatchObject({ ok: false });
  });

  it('valida forma de los claims', () => {
    const base = signWidgetIdentity({ cliente: '1' }, SECRET, NOW);
    expect(verifyWidgetIdentity({ ...base, claims: {} }, SECRET, NOW)).toMatchObject({ reason: 'claims' });
    expect(verifyWidgetIdentity({ ...base, claims: { cliente: 1 } }, SECRET, NOW)).toMatchObject({ reason: 'claims' });
    expect(verifyWidgetIdentity({ ...base, claims: { 'mal clave': 'x' } }, SECRET, NOW)).toMatchObject({ reason: 'claims' });
    expect(verifyWidgetIdentity({ ...base, ts: '1' }, SECRET, NOW)).toMatchObject({ reason: 'ts' });
    expect(verifyWidgetIdentity('basura', SECRET, NOW)).toMatchObject({ reason: 'formato' });
  });

  it('el cuerpo del chat nunca deja pasar verifiedIdentity puesta por el navegador', () => {
    const raw = JSON.stringify({
      message: 'hola',
      verifiedIdentity: { cliente: 'otro' },
      identity: PHP_VECTOR,
    });
    const { body, identity } = extractIdentityFromChatBody(raw);
    expect(JSON.parse(body)).toEqual({ message: 'hola' });
    expect(identity).toEqual(PHP_VECTOR);
  });

  it('cuerpo sin identidad queda intacto; no-JSON también', () => {
    const raw = '{"message":"hola"}';
    expect(extractIdentityFromChatBody(raw)).toEqual({ body: raw, identity: undefined });
    expect(extractIdentityFromChatBody('no json').body).toBe('no json');
  });

  it('inyecta la identidad verificada', () => {
    expect(JSON.parse(injectVerifiedIdentity('{"message":"hola"}', { cliente: '1' }))).toEqual({
      message: 'hola',
      verifiedIdentity: { cliente: '1' },
    });
  });
});
