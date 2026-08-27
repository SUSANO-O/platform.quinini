import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkTicketDeflection } from '../ticket-deflection-client';

describe('checkTicketDeflection', () => {
  const originalFetch = global.fetch;
  const originalBackendUrl = process.env.BACKEND_URL;

  beforeEach(() => {
    process.env.BACKEND_URL = 'http://127.0.0.1:9003';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.BACKEND_URL = originalBackendUrl;
  });

  function mockFetch(impl: () => Promise<unknown>) {
    const fn = vi.fn().mockImplementation(impl);
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it('devuelve confident:true con la fuente cuando el hub encuentra un match', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ success: true, data: { confident: true, sourceText: 'Restablecé tu contraseña.', score: 0.7 } }),
    }));
    const result = await checkTicketDeflection({ agentId: 'a1', query: 'no puedo ingresar' });
    expect(result).toEqual({ confident: true, sourceText: 'Restablecé tu contraseña.', score: 0.7 });
  });

  it('devuelve confident:false cuando el hub no encuentra match', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ success: true, data: { confident: false } }),
    }));
    const result = await checkTicketDeflection({ agentId: 'a1', query: 'algo raro' });
    expect(result).toEqual({ confident: false });
  });

  it('fail-open (confident:false) si la respuesta HTTP no es ok', async () => {
    mockFetch(async () => ({ ok: false, json: async () => ({}) }));
    const result = await checkTicketDeflection({ agentId: 'a1', query: 'x' });
    expect(result).toEqual({ confident: false });
  });

  it('fail-open si fetch lanza (timeout, backend caído)', async () => {
    mockFetch(async () => {
      throw new Error('network down');
    });
    const result = await checkTicketDeflection({ agentId: 'a1', query: 'x' });
    expect(result).toEqual({ confident: false });
  });

  it('fail-open si no hay BACKEND_URL configurado, sin llamar a fetch', async () => {
    process.env.BACKEND_URL = '';
    const fn = mockFetch(async () => ({ ok: true, json: async () => ({}) }));
    const result = await checkTicketDeflection({ agentId: 'a1', query: 'x' });
    expect(result).toEqual({ confident: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it('fail-open si sourceText viene vacío aunque confident sea true', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ success: true, data: { confident: true, sourceText: '   ' } }),
    }));
    const result = await checkTicketDeflection({ agentId: 'a1', query: 'x' });
    expect(result).toEqual({ confident: false });
  });
});
