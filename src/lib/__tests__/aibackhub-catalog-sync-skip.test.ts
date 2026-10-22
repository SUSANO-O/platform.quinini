import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El chat sincronizaba el catálogo del agente en el hub en cada mensaje. Con `skipIfUnchanged`
 * solo se repite el PUT si el agente cambió, si el anterior falló o si pasaron 5 minutos.
 */
vi.mock('@/lib/db/connection', () => ({ connectDB: vi.fn() }));
vi.mock('@/lib/db/models', () => ({ ClientAgent: {} }));

import { resetCatalogSyncMemoForTests, syncHubCatalogFromLandingAgentDoc } from '@/lib/aibackhub-sync';

type AgentArg = Parameters<typeof syncHubCatalogFromLandingAgentDoc>[0];

function agent(overrides: Record<string, unknown> = {}): AgentArg {
  return {
    _id: { toString: () => '6a961f2f03b5a5df98cfeaca' },
    agentHubId: 'agente-academico',
    name: 'Asistente Académico',
    description: '',
    systemPrompt: 'Eres un asistente.',
    model: 'vx/gemini-3.8-flash',
    enabledMcpToolIds: ['mcp:googleCalendar:calendar_list_events'],
    ...overrides,
  } as unknown as AgentArg;
}

const fetchMock = vi.fn();
const prevBackend = process.env.BACKEND_URL;

beforeEach(() => {
  process.env.BACKEND_URL = 'http://hub.test';
  resetCatalogSyncMemoForTests();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (prevBackend === undefined) delete process.env.BACKEND_URL;
  else process.env.BACKEND_URL = prevBackend;
});

describe('syncHubCatalogFromLandingAgentDoc — skipIfUnchanged', () => {
  it('el segundo mensaje con el agente igual no repite el PUT', async () => {
    expect(await syncHubCatalogFromLandingAgentDoc(agent(), { skipIfUnchanged: true })).toBe(true);
    expect(await syncHubCatalogFromLandingAgentDoc(agent(), { skipIfUnchanged: true })).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PUT' });
  });

  it('si el agente cambió (prompt o tools) vuelve a sincronizar', async () => {
    await syncHubCatalogFromLandingAgentDoc(agent(), { skipIfUnchanged: true });
    await syncHubCatalogFromLandingAgentDoc(agent({ systemPrompt: 'Prompt nuevo.' }), { skipIfUnchanged: true });
    await syncHubCatalogFromLandingAgentDoc(
      agent({ systemPrompt: 'Prompt nuevo.', enabledMcpToolIds: [] }),
      { skipIfUnchanged: true },
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('sin la opción (guardar agente, auditoría, reintento) sincroniza siempre', async () => {
    await syncHubCatalogFromLandingAgentDoc(agent());
    await syncHubCatalogFromLandingAgentDoc(agent());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('un PUT fallido no cuenta como sincronizado', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    expect(await syncHubCatalogFromLandingAgentDoc(agent(), { skipIfUnchanged: true })).toBe(false);
    expect(await syncHubCatalogFromLandingAgentDoc(agent(), { skipIfUnchanged: true })).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('pasados 5 minutos vuelve a sincronizar aunque no cambie', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T10:00:00Z'));
    await syncHubCatalogFromLandingAgentDoc(agent(), { skipIfUnchanged: true });
    vi.setSystemTime(new Date('2026-10-22T10:04:00Z'));
    await syncHubCatalogFromLandingAgentDoc(agent(), { skipIfUnchanged: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-22T10:05:01Z'));
    await syncHubCatalogFromLandingAgentDoc(agent(), { skipIfUnchanged: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cada agente lleva su propia huella', async () => {
    await syncHubCatalogFromLandingAgentDoc(agent(), { skipIfUnchanged: true });
    await syncHubCatalogFromLandingAgentDoc(agent({ agentHubId: 'tribu-app' }), { skipIfUnchanged: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
