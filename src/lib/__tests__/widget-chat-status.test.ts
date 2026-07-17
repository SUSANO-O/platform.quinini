import { describe, expect, it } from 'vitest';
import {
  hintsFromAgentDoc,
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
});

