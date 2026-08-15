import { describe, expect, it } from 'vitest';
import {
  hintsFromAgentDoc,
  runWithWidgetStatusPulse,
  widgetChatStatusForUserMessage,
  widgetChatStatusMessage,
} from '@/lib/widget-chat-status';

describe('widget-chat-status', () => {
  it('widgetChatStatusMessage devuelve textos en español por fase', () => {
    expect(widgetChatStatusMessage('prepare')).toContain('Preparando');
    expect(widgetChatStatusMessage('skills', 'web_search')).toContain('web_search');
    expect(widgetChatStatusMessage('rag')).toContain('documentos');
    expect(widgetChatStatusMessage('mcp')).toContain('integraciones');
  });

  it('hintsFromAgentDoc detecta skills, RAG y MCP', () => {
    const hints = hintsFromAgentDoc({
      skills: ['web_search'],
      skillsConfig: [{ id: 'crm_integration', enabled: true }],
      ragEnabled: true,
      enabledMcpToolIds: ['mcp:hubspot:hubspot_search_contacts'],
      tools: [{ toolId: 'webhook' }],
    });
    expect(hints.hasSkills).toBe(true);
    expect(hints.skillCount).toBe(2);
    expect(hints.ragEnabled).toBe(true);
    expect(hints.hasMcpTools).toBe(true);
    expect(hints.hasWebhookTools).toBe(true);
  });

  it('hintsFromAgentDoc marca MCP solo por skill web_search (sin enabledMcpToolIds)', () => {
    const hints = hintsFromAgentDoc({
      skills: ['web_search'],
      ragEnabled: false,
    });
    expect(hints.hasSkills).toBe(true);
    expect(hints.hasMcpTools).toBe(true);
  });

  it('hintsFromAgentDoc no marca MCP por skills solo prompt', () => {
    const hints = hintsFromAgentDoc({
      skills: ['customer_service', 'knowledge_base'],
    });
    expect(hints.hasSkills).toBe(true);
    expect(hints.hasMcpTools).toBe(false);
  });

  it('A3 inventario: mensaje contextual en fase rag/hub', () => {
    const msg =
      'Que Kia Picanto 2026 tienen en el inventario premium de MatIAs Auto Sales en Bogota?';
    expect(widgetChatStatusForUserMessage(msg, 'rag')).toBe('Consultando catálogo y precios…');
    expect(widgetChatStatusForUserMessage(msg, 'hub')).toBe('Consultando catálogo y precios…');
  });

  it('A6 retoma: mensaje contextual en fase model/hub', () => {
    const msg =
      'Si el Picanto nuevo del inventario vale lo que ustedes manejan, cuanto me faltaria para el cambio? Razona en voz alta.';
    expect(widgetChatStatusForUserMessage(msg, 'model')).toBe('Razonando con las cifras del hilo…');
    expect(widgetChatStatusForUserMessage(msg, 'hub')).toBe('Calculando con las cifras ya conocidas…');
  });

  it('runWithWidgetStatusPulse emite status inicial y ejecuta trabajo', async () => {
    const events: Array<Record<string, unknown>> = [];
    const out = await runWithWidgetStatusPulse(
      (data) => events.push(data),
      'hola',
      'prepare',
      async () => 'ok',
    );
    expect(out).toBe('ok');
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.type).toBe('status');
  });
});

