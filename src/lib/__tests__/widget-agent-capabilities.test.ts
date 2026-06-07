import { describe, expect, it } from 'vitest';
import {
  buildAgentCapabilityProfile,
  scoreMemberCapabilityMatch,
} from '../widget-agent-capabilities';
import { DEFAULT_AGENT_SKILLS_CATALOG } from '../agent-skills-catalog-defaults';

describe('widget-agent-capabilities', () => {
  it('mapea MCP mongodb con temas de base de datos', () => {
    const profile = buildAgentCapabilityProfile({
      agent: {
        name: 'mongo agent',
        agentHubId: 'mongo-agent',
        enabledMcpToolIds: ['mcp:mongodb:mongo_find', 'mcp:mongodb:mongo_aggregate_readonly'],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    expect(profile.items.some((i) => i.kind === 'mcp' && i.id === 'mongodb')).toBe(true);
    expect(profile.signals).toContain('base de datos');
    expect(profile.signals).toContain('mongodb');
  });

  it('mapea webhooks y crons por nombre', () => {
    const profile = buildAgentCapabilityProfile({
      agent: {
        name: 'asesor financiero',
        tools: [
          {
            toolId: 'webhook',
            config: {
              webhooks: [{ name: 'buscadenoticiasdeldia', description: 'noticias mundiales' }],
            },
          },
        ],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
      scheduledTasks: [{ name: 'inversion', actionType: 'webhook', enabled: true }],
    });
    expect(profile.items.some((i) => i.kind === 'webhook' && i.label === 'buscadenoticiasdeldia')).toBe(true);
    expect(profile.items.some((i) => i.kind === 'cron' && i.id === 'inversion')).toBe(true);
  });

  it('scoreMemberCapabilityMatch prioriza agente con MCP mongo ante pregunta de BD', () => {
    const mongoProfile = buildAgentCapabilityProfile({
      agent: {
        name: 'mongo agent',
        enabledMcpToolIds: ['mcp:mongodb:mongo_find'],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const financeProfile = buildAgentCapabilityProfile({
      agent: {
        name: 'asesor financiero',
        tools: [{ toolId: 'webhook', config: { webhooks: [{ name: 'noticias' }] } }],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const mongoScore = scoreMemberCapabilityMatch('tienes coneccion a base de datos ?', {
      name: 'mongo agent',
      description: '',
      hubId: 'mongo-agent',
      role: 'orchestrator',
      capabilities: mongoProfile,
    });
    const financeScore = scoreMemberCapabilityMatch('tienes coneccion a base de datos ?', {
      name: 'asesor financiero',
      description: 'finanzas',
      hubId: 'asesor-financiero',
      role: 'orchestrator',
      capabilities: financeProfile,
    });
    expect(mongoScore).toBeGreaterThan(financeScore);
  });
});
