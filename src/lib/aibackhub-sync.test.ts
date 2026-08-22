import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCatalogAgentFromHub,
  invalidateHubAgentCache,
  pushClientAgentToHubCatalog,
} from './aibackhub-sync';

/**
 * `fetchCatalogAgentFromHub` se llama en CADA mensaje del widget chat (una vez por
 * el agente primario, y una vez por cada especialista sin MCP local). Bajo carga
 * concurrente eso multiplicaba GETs redundantes al mismo agentHubId contra AIBackHub
 * — visto en la prueba de carga real (múltiples GET casi simultáneos). Este cache
 * corto evita esa redundancia sin servir datos viejos por mucho tiempo.
 */
describe('aibackhub-sync — cache de fetchCatalogAgentFromHub', () => {
  const originalFetch = global.fetch;
  const originalBackendUrl = process.env.BACKEND_URL;

  beforeEach(() => {
    process.env.BACKEND_URL = 'http://127.0.0.1:9003';
    invalidateHubAgentCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.BACKEND_URL = originalBackendUrl;
    invalidateHubAgentCache();
  });

  function mockFetchOk(data: Record<string, unknown>) {
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data }),
    });
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it('solo pega a la red una vez para el mismo agentHubId dentro del TTL', async () => {
    const fn = mockFetchOk({ id: 'hub_1', name: 'Asesor Ventas' });

    const first = await fetchCatalogAgentFromHub('hub_1');
    const second = await fetchCatalogAgentFromHub('hub_1');
    const third = await fetchCatalogAgentFromHub('hub_1');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(first?.name).toBe('Asesor Ventas');
  });

  it('single-flight: 5 llamadas concurrentes al MISMO agentHubId con cache frío solo disparan 1 fetch', async () => {
    // Éste es el escenario real que rompía la prueba de carga: 5 requests de chat
    // arrancan casi al mismo tiempo, todas con el cache frío. Un mock con delay
    // simula que el fetch tarda — si no hay single-flight, las 5 pasan el check
    // de cache antes de que la primera responda y cachee.
    let resolveResponse!: (v: unknown) => void;
    const pending = new Promise((r) => { resolveResponse = r; });
    const fn = vi.fn().mockReturnValue(
      pending.then(() => ({ ok: true, json: async () => ({ success: true, data: { id: 'hub_2', name: 'Closer de Ventas' } }) })),
    );
    global.fetch = fn as unknown as typeof fetch;

    const calls = Promise.all(Array.from({ length: 5 }, () => fetchCatalogAgentFromHub('hub_2')));
    // deja que las 5 lleguen al punto de "no hay cache, no hay in-flight, arranco fetch"
    await new Promise((r) => setTimeout(r, 0));
    resolveResponse(undefined);
    const results = await calls;

    expect(fn).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r?.id).toBe('hub_2');
  });

  it('agentHubId distintos concurrentes SÍ disparan un fetch cada uno (no comparten in-flight)', async () => {
    const fn = mockFetchOk({ id: 'hub_x', name: 'Agente X' });
    await Promise.all([
      fetchCatalogAgentFromHub('hub_a'),
      fetchCatalogAgentFromHub('hub_b'),
    ]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('agentHubId distintos no comparten entrada de cache', async () => {
    const fn = mockFetchOk({ id: 'hub_3', name: 'Agente C' });
    await fetchCatalogAgentFromHub('hub_3');
    await fetchCatalogAgentFromHub('hub_4');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('invalidateHubAgentCache(id) fuerza un nuevo fetch solo para ese id', async () => {
    const fn = mockFetchOk({ id: 'hub_5', name: 'Antes' });
    await fetchCatalogAgentFromHub('hub_5');
    expect(fn).toHaveBeenCalledTimes(1);

    invalidateHubAgentCache('hub_5');
    await fetchCatalogAgentFromHub('hub_5');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('pushClientAgentToHubCatalog invalida el cache de ese agente al escribir OK', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}), text: async () => '' });
    global.fetch = fn as unknown as typeof fetch;

    await fetchCatalogAgentFromHub('hub_6'); // cachea una respuesta vacía (fetch mock no matchea forma esperada -> null)
    const callsAfterGet = fn.mock.calls.length;

    await pushClientAgentToHubCatalog({
      agentHubId: 'hub_6',
      name: 'Nuevo nombre',
      description: 'x',
      systemPrompt: 'y',
      model: 'gemini-2.5-flash',
    });

    // el siguiente GET debe volver a pegarle a la red (cache invalidado por el PUT)
    await fetchCatalogAgentFromHub('hub_6');
    expect(fn.mock.calls.length).toBeGreaterThan(callsAfterGet + 1); // PUT + GET nuevo
  });

  it('no cachea entre corridas si BACKEND_URL falta (no llama a fetch)', async () => {
    process.env.BACKEND_URL = '';
    const fn = vi.fn();
    global.fetch = fn as unknown as typeof fetch;
    const result = await fetchCatalogAgentFromHub('hub_7');
    expect(result).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});
