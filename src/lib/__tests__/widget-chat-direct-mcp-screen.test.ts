import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Leer la pantalla": el `screenContext` que manda el navegador solo llega al agente si el widget
 * tiene la opción activada en el servidor (no basta con que el cuerpo lo traiga).
 */
const { mockConnectDB, mockFindOne, mockGetBase, mockHeaders, mockSyncCatalog } = vi.hoisted(() => ({
  mockConnectDB: vi.fn(),
  mockFindOne: vi.fn(),
  mockGetBase: vi.fn(),
  mockHeaders: vi.fn(),
  mockSyncCatalog: vi.fn(),
}));

vi.mock('@/lib/db/connection', () => ({ connectDB: mockConnectDB }));
vi.mock('@/lib/db/models', () => ({ ClientAgent: { findOne: mockFindOne } }));
vi.mock('@/lib/aibackhub-sync', () => ({
  getAibackhubBaseUrl: mockGetBase,
  hubCreateHeaders: mockHeaders,
  syncHubCatalogFromLandingAgentDoc: mockSyncCatalog,
}));

import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';

const SCREEN =
  'Encabezados visibles: AI data\nSeleccionado/activo ahora: AI data\nMenú (a la izquierda): Posición Actual · Rutas · AI data';

let sentBody: Record<string, unknown> | null = null;

beforeEach(() => {
  sentBody = null;
  mockGetBase.mockReturnValue('http://hub.test');
  mockHeaders.mockReturnValue({});
  mockSyncCatalog.mockResolvedValue(true);
  mockFindOne.mockReturnValue({
    lean: vi.fn().mockResolvedValue({
      _id: 'agent_1',
      agentHubId: '',
      model: 'vx/gemini-3.8-flash',
      systemPrompt: 'Eres Navi.',
      tools: [],
      enabledMcpToolIds: ['mcp:mysql:mysql_query'],
    }),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      sentBody = JSON.parse(init.body) as Record<string, unknown>;
      return new Response(JSON.stringify({ reply: 'Estás en AI data.' }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function run(screenContextEnabled: boolean | undefined) {
  return tryServeWidgetChatViaHubMcp({
    widgetTokenStartsWithWt: true,
    parsedAgentId: 'agent_1',
    rawBody: JSON.stringify({
      message: '¿En qué vista estoy?',
      history: [],
      pagePath: '/views/detalle.php?id=9',
      pageTitle: 'Tribu GPS',
      screenContext: SCREEN,
    }),
    ownerUserId: 'user_1',
    screenContextEnabled,
  });
}

describe('tryServeWidgetChatViaHubMcp — leer la pantalla', () => {
  it('con la opción activada el agente recibe [PANTALLA ACTUAL]', async () => {
    await run(true);
    const ctx = String(sentBody?.sessionContextBlock ?? '');
    expect(ctx).toContain('[PANTALLA ACTUAL]');
    expect(ctx).toContain('Seleccionado/activo ahora: AI data');
  });

  it('sin la opción en el servidor se ignora aunque el navegador la mande', async () => {
    await run(false);
    expect(String(sentBody?.sessionContextBlock ?? '')).not.toContain('PANTALLA ACTUAL');
    await run(undefined);
    expect(String(sentBody?.sessionContextBlock ?? '')).not.toContain('AI data');
  });
});
