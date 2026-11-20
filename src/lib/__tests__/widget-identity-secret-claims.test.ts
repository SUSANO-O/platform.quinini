import { describe, expect, it } from 'vitest';
import { isSecretClaim, signWidgetIdentity, verifyWidgetIdentity } from '../widget-identity';

const SECRET = 'a'.repeat(64);
const jwt = `eyJhbGciOiJIUzI1NiJ9.${'x'.repeat(1200)}.firma`;

describe('identidad firmada: claims secretas (token del visitante para MCP remotos)', () => {
  it('acepta un JWT largo en una claim secreta y lo conserva intacto', () => {
    const signed = signWidgetIdentity({ cliente: '42', tribu_token: jwt }, SECRET);
    const r = verifyWidgetIdentity(signed, SECRET);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.claims.tribu_token).toBe(jwt);
  });

  it('las claims normales siguen limitadas a 128 caracteres', () => {
    const signed = signWidgetIdentity({ cliente: 'x'.repeat(200) }, SECRET);
    expect(verifyWidgetIdentity(signed, SECRET)).toEqual({ ok: false, reason: 'claims' });
  });

  it('una claim secreta de más de 4096 caracteres se rechaza', () => {
    const signed = signWidgetIdentity({ tribu_token: 'x'.repeat(5000) }, SECRET);
    expect(verifyWidgetIdentity(signed, SECRET)).toEqual({ ok: false, reason: 'claims' });
  });

  it('el JWT va dentro de la firma: si se cambia, la identidad no vale', () => {
    const signed = signWidgetIdentity({ cliente: '42', tribu_token: jwt }, SECRET);
    const tampered = { ...signed, claims: { ...signed.claims, tribu_token: `${jwt}X` } };
    expect(verifyWidgetIdentity(tampered, SECRET)).toEqual({ ok: false, reason: 'firma' });
  });

  it('misma regla de nombres que el hub', () => {
    for (const k of ['token', 'tribu_token', 'access_token', 'jwt', 'session_jwt', 'api_secret']) expect(isSecretClaim(k), k).toBe(true);
    for (const k of ['cliente', 'admin', 'nombre', 'tokens_usados']) expect(isSecretClaim(k), k).toBe(false);
  });
});
