import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integración del agente caída (p. ej. la BD MySQL del cliente no responde): el hub rechaza el
 * turno con NO_MCP_TOOLS. El chat debe seguir conociendo la página actual y el mapa de la app
 * para poder proponer el botón de navegación, en vez de caer al hub sin contexto.
 */
const { mockConnectDB, mockFindOne, mockGetBase, mockHeaders, mockSyncCatalog, mockHubFetch } = vi.hoisted(() => ({
  mockConnectDB: vi.fn(),
  mockFindOne: vi.fn(),
  mockGetBase: vi.fn(),
  mockHeaders: vi.fn(),
  mockSyncCatalog: vi.fn(),
  mockHubFetch: vi.fn(),
}));

vi.mock('@/lib/db/connection', () => ({ connectDB: mockConnectDB }));
vi.mock('@/lib/db/models', () => ({ ClientAgent: { findOne: mockFindOne } }));
vi.mock('@/lib/aibackhub-sync', () => ({
  getAibackhubBaseUrl: mockGetBase,
  hubCreateHeaders: mockHeaders,
  hubFetch: mockHubFetch,
  syncHubCatalogFromLandingAgentDoc: mockSyncCatalog,
}));

import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';
import { tryServeWidgetChatViaDirectInference } from '@/lib/widget-chat-direct-inference';

const AGENT_WITH_MYSQL = {
  _id: 'agent_1',
  agentHubId: '',
  model: 'vx/gemini-2.5-flash',
  systemPrompt: 'Eres Navi.',
  tools: [],
  enabledMcpToolIds: ['mcp:mysql:mysql_query'],
};

const BODY = JSON.stringify({
  message: '¿Dónde creo un cliente nuevo?',
  history: [],
  pagePath: 'https://app.ejemplo.com/views/ruta.php?k_disp=12',
  pageTitle: 'Rutas',
});

beforeEach(() => {
  mockGetBase.mockReturnValue('https://hub.test');
  mockHeaders.mockReturnValue({});
  mockSyncCatalog.mockResolvedValue(undefined);
  mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(AGENT_WITH_MYSQL) });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('tryServeWidgetChatViaHubMcp — outcome.noMcpTools', () => {
  it('lo marca cuando el hub responde NO_MCP_TOOLS', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'NO_MCP_TOOLS' } }),
    })));
    const outcome: { noMcpTools?: boolean } = {};
    const res = await tryServeWidgetChatViaHubMcp({
      widgetTokenStartsWithWt: true,
      parsedAgentId: 'agent_1',
      rawBody: BODY,
      ownerUserId: 'user_1',
      outcome,
    });
    expect(res).toBeNull();
    expect(outcome.noMcpTools).toBe(true);
  });

  it('no lo marca con otros errores del hub', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, text: async () => 'boom' })));
    const outcome: { noMcpTools?: boolean } = {};
    await tryServeWidgetChatViaHubMcp({
      widgetTokenStartsWithWt: true,
      parsedAgentId: 'agent_1',
      rawBody: BODY,
      ownerUserId: 'user_1',
      outcome,
    });
    expect(outcome.noMcpTools).toBeUndefined();
  });
});

describe('tryServeWidgetChatViaDirectInference — sin tools disponibles', () => {
  function stubModelsReply(text: string) {
    mockHubFetch.mockImplementation(async (path: string) => {
      if (path === '/api/models') return { ok: true, json: async () => ({ text }) };
      return { ok: false, json: async () => ({}) };
    });
  }

  function modelsPayload(): Record<string, unknown> {
    const call = mockHubFetch.mock.calls.find(([p]) => p === '/api/models');
    return JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
  }

  it('sin allowWithoutMcp sigue cediendo al MCP (agente con tools)', async () => {
    stubModelsReply('hola');
    const res = await tryServeWidgetChatViaDirectInference({
      parsedAgentId: 'agent_1',
      rawBody: BODY,
      ownerUserId: 'user_1',
    });
    expect(res).toBeNull();
    expect(mockHubFetch.mock.calls.some(([p]) => p === '/api/models')).toBe(false);
  });

  it('con allowWithoutMcp responde y le pasa al modelo la página actual y el mapa de la app', async () => {
    stubModelsReply('Ve a Configuraciones → Clientes. ¿Quieres que te lleve?');
    const res = await tryServeWidgetChatViaDirectInference({
      parsedAgentId: 'agent_1',
      rawBody: BODY,
      ownerUserId: 'user_1',
      allowWithoutMcp: true,
      appMap: [{ path: '/views/clientes.php', name: 'Clientes' }],
    });
    expect(res?.reply).toContain('Clientes');
    const prompt = String(modelsPayload().prompt);
    expect(prompt).toContain('Página actual del cliente en la app: /views/ruta.php?k_disp=12');
    expect(prompt).toContain('Título de la página: Rutas');
    expect(prompt).toContain('/views/clientes.php');
  });
});
