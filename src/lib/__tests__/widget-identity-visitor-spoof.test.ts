import { describe, expect, it } from 'vitest';
import { extractIdentityFromChatBody } from '@/lib/widget-identity';

/**
 * Math-ais: `visitorUserId` decide como quién actúa `botiva_api_request`. Solo puede salir
 * de la cookie de sesión verificada, nunca del cuerpo que manda el navegador.
 */
describe('extractIdentityFromChatBody — suplantación de visitante', () => {
  it('borra visitorUserId y visitorPlan que manda el navegador', () => {
    const raw = JSON.stringify({ message: 'hola', visitorUserId: 'victima-123', visitorPlan: 'enterprise' });
    const { body, identity } = extractIdentityFromChatBody(raw);
    expect(JSON.parse(body)).toEqual({ message: 'hola' });
    expect(identity).toBeUndefined();
  });

  it('los borra también junto a una identidad firmada, que se conserva aparte', () => {
    const signed = { claims: { cliente: '1' }, ts: 1, sig: 'x' };
    const raw = JSON.stringify({ message: 'hola', visitorUserId: 'victima-123', identity: signed });
    const { body, identity } = extractIdentityFromChatBody(raw);
    expect(JSON.parse(body)).toEqual({ message: 'hola' });
    expect(identity).toEqual(signed);
  });

  it('no toca visitorId (visitante anónimo, no da permisos)', () => {
    const raw = JSON.stringify({ message: 'hola', visitorId: 'anon-1', visitorUserId: 'victima-123' });
    expect(JSON.parse(extractIdentityFromChatBody(raw).body)).toEqual({ message: 'hola', visitorId: 'anon-1' });
  });
});
