import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockClientAgentFindOne,
  mockWidgetMessageFind,
  mockCheckTicketDeflection,
  mockGetPendingDeflectionSurvey,
  mockSetPendingDeflectionSurvey,
  mockIsAwaitingProblemDescription,
  mockSetAwaitingProblemDescription,
  mockClearTicketDeflectionState,
} = vi.hoisted(() => ({
  mockClientAgentFindOne: vi.fn(),
  mockWidgetMessageFind: vi.fn(),
  mockCheckTicketDeflection: vi.fn(),
  mockGetPendingDeflectionSurvey: vi.fn(),
  mockSetPendingDeflectionSurvey: vi.fn(),
  mockIsAwaitingProblemDescription: vi.fn(),
  mockSetAwaitingProblemDescription: vi.fn(),
  mockClearTicketDeflectionState: vi.fn(),
}));

vi.mock('@/lib/db/models', () => ({
  ClientAgent: { findOne: mockClientAgentFindOne },
  WidgetMessage: { find: mockWidgetMessageFind },
}));
vi.mock('@/lib/debug-widget-flow', () => ({ logWidgetFlow: vi.fn() }));
vi.mock('@/lib/ticket-deflection-client', () => ({ checkTicketDeflection: mockCheckTicketDeflection }));
vi.mock('@/lib/ticket-deflection-state', () => ({
  getPendingDeflectionSurvey: mockGetPendingDeflectionSurvey,
  setPendingDeflectionSurvey: mockSetPendingDeflectionSurvey,
  isAwaitingProblemDescription: mockIsAwaitingProblemDescription,
  setAwaitingProblemDescription: mockSetAwaitingProblemDescription,
  clearTicketDeflectionState: mockClearTicketDeflectionState,
}));

import { checkAndBuildTicketDeflectionReply } from '@/lib/ticket-deflection-flow';
import { OPEN_TICKET_FORM_MARKER } from '@/lib/ticket-form-intent';

function baseParams(overrides: Partial<Parameters<typeof checkAndBuildTicketDeflectionReply>[0]> = {}) {
  return {
    agentId: 'agent1',
    message: 'hola',
    sessionId: 'sess1',
    widgetId: 'widget1',
    ownerUserId: 'user1',
    traceId: 'trace1',
    logPrefix: 'chat' as const,
    ...overrides,
  };
}

function agentDoc(overrides: Record<string, unknown> = {}) {
  return { enabledMcpToolIds: ['mcp:slack:slack_create_ticket'], agentHubId: 'hub-agent1', ...overrides };
}

describe('checkAndBuildTicketDeflectionReply', () => {
  beforeEach(() => {
    mockClientAgentFindOne.mockReset().mockReturnValue({ select: () => ({ lean: async () => agentDoc() }) });
    mockWidgetMessageFind.mockReset().mockReturnValue({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
    mockCheckTicketDeflection.mockReset().mockResolvedValue({ confident: false });
    mockGetPendingDeflectionSurvey.mockReset().mockResolvedValue(null);
    mockSetPendingDeflectionSurvey.mockReset();
    mockIsAwaitingProblemDescription.mockReset().mockResolvedValue(false);
    mockSetAwaitingProblemDescription.mockReset();
    mockClearTicketDeflectionState.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('mensaje sin intención de ticket ni estado pendiente → no intercepta', async () => {
    const result = await checkAndBuildTicketDeflectionReply(baseParams({ message: 'hola, quiero cotizar' }));
    expect(result).toEqual({ intercepted: false });
  });

  it('agente sin capacidad de tickets → no intercepta aunque el mensaje suene a reclamo', async () => {
    mockClientAgentFindOne.mockReturnValue({ select: () => ({ lean: async () => agentDoc({ enabledMcpToolIds: [] }) }) });
    const result = await checkAndBuildTicketDeflectionReply(baseParams({ message: 'quiero abrir un ticket' }));
    expect(result).toEqual({ intercepted: false });
  });

  describe('encuesta pendiente ("¿esto te resolvió?")', () => {
    beforeEach(() => {
      mockGetPendingDeflectionSurvey.mockResolvedValue({ sourceText: 'reiniciá la app' });
    });

    it('responde "sí" → cierre feliz, limpia estado', async () => {
      const result = await checkAndBuildTicketDeflectionReply(baseParams({ message: 'sí, gracias' }));
      expect(result.intercepted).toBe(true);
      if (!result.intercepted) return;
      expect(result.text).toMatch(/genial/i);
      expect(mockClearTicketDeflectionState).toHaveBeenCalledWith('widget1', 'sess1', 'user1');
    });

    it('responde "no" → fuerza el formulario de ticket', async () => {
      const result = await checkAndBuildTicketDeflectionReply(baseParams({ message: 'no, sigue igual' }));
      expect(result).toEqual({ intercepted: true, text: OPEN_TICKET_FORM_MARKER });
    });

    it('respuesta ambigua → limpia el estado y NO intercepta (sigue el flujo normal)', async () => {
      const result = await checkAndBuildTicketDeflectionReply(baseParams({ message: 'cambio de tema, otra pregunta' }));
      expect(result).toEqual({ intercepted: false });
      expect(mockClearTicketDeflectionState).toHaveBeenCalled();
    });
  });

  describe('esperando descripción del problema', () => {
    beforeEach(() => {
      mockIsAwaitingProblemDescription.mockResolvedValue(true);
    });

    it('RAG confiado → muestra la encuesta en vez de abrir el ticket directo', async () => {
      mockCheckTicketDeflection.mockResolvedValue({ confident: true, sourceText: 'Reiniciá desde ajustes.' });
      const result = await checkAndBuildTicketDeflectionReply(baseParams({ message: 'no puedo iniciar sesión' }));
      expect(result.intercepted).toBe(true);
      if (!result.intercepted) return;
      expect(result.text).toContain('Reiniciá desde ajustes.');
      expect(mockSetPendingDeflectionSurvey).toHaveBeenCalledWith('widget1', 'sess1', 'user1', {
        sourceText: 'Reiniciá desde ajustes.',
      });
    });

    it('RAG sin confianza → abre el ticket directo', async () => {
      mockCheckTicketDeflection.mockResolvedValue({ confident: false });
      const result = await checkAndBuildTicketDeflectionReply(baseParams({ message: 'no puedo iniciar sesión' }));
      expect(result).toEqual({ intercepted: true, text: OPEN_TICKET_FORM_MARKER });
    });
  });

  describe('pedido de ticket nuevo (sin estado previo)', () => {
    it('pedido vago → pregunta el problema, guarda estado awaiting', async () => {
      const result = await checkAndBuildTicketDeflectionReply(baseParams({ message: 'quiero levantar un ticket' }));
      expect(result.intercepted).toBe(true);
      if (!result.intercepted) return;
      expect(result.text).toMatch(/detalle/i);
      expect(mockSetAwaitingProblemDescription).toHaveBeenCalledWith('widget1', 'sess1', 'user1');
    });

    it('pedido concreto + RAG confiado → encuesta', async () => {
      mockCheckTicketDeflection.mockResolvedValue({ confident: true, sourceText: 'Ver FAQ de facturación.' });
      const result = await checkAndBuildTicketDeflectionReply(
        baseParams({ message: 'quiero reportar un problema con mi factura duplicada' }),
      );
      expect(result.intercepted).toBe(true);
      if (!result.intercepted) return;
      expect(result.text).toContain('Ver FAQ de facturación.');
    });

    it('pedido concreto + RAG sin confianza → abre el ticket directo', async () => {
      const result = await checkAndBuildTicketDeflectionReply(
        baseParams({ message: 'quiero reportar un problema con mi factura duplicada' }),
      );
      expect(result).toEqual({ intercepted: true, text: OPEN_TICKET_FORM_MARKER });
    });

    it('usa agentHubId (no el ObjectId de landing) para consultar el RAG', async () => {
      mockClientAgentFindOne.mockReturnValue({
        select: () => ({ lean: async () => agentDoc({ agentHubId: 'hub-slug-x' }) }),
      });
      await checkAndBuildTicketDeflectionReply(
        baseParams({ agentId: '6a3441c15688b5b1509fad7d', message: 'no me funciona la app, reportar problema' }),
      );
      expect(mockCheckTicketDeflection).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'hub-slug-x' }),
      );
    });
  });

  it('fail-open: si algo lanza una excepción, no intercepta (el LLM sigue teniendo su chance)', async () => {
    mockClientAgentFindOne.mockImplementation(() => {
      throw new Error('Mongo caído');
    });
    const result = await checkAndBuildTicketDeflectionReply(baseParams({ message: 'quiero abrir un ticket' }));
    expect(result).toEqual({ intercepted: false });
  });
});
