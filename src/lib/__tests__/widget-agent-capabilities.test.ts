import { describe, expect, it } from 'vitest';
import {
  buildAgentCapabilityProfile,
  memberHasHubspotCapability,
  messageLooksContactIntent,
  messageLooksToolIntent,
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
    expect(profile.toolSignals).toContain('base de datos');
    expect(profile.toolSignals).toContain('mongodb');
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

  it('incluye systemPrompt en dominio del perfil', () => {
    const profile = buildAgentCapabilityProfile({
      agent: {
        name: 'asesor financiero',
        description: 'consultas financieras',
        systemPrompt: 'Eres un asesor financiero personal. Ayudas a mejorar finanzas, ahorro e inversiones.',
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    expect(profile.domainSummary).toContain('asesor financiero');
    expect(profile.domainSignals.some((s) => s.includes('finanz'))).toBe(true);
    expect(profile.summary).toContain('dominio:');
  });

  it('pregunta financiera no es tool-intent', () => {
    expect(messageLooksToolIntent('como puedo mejorar mis finanzas personales')).toBe(false);
    expect(messageLooksToolIntent('tienes conexion a base de datos')).toBe(true);
    expect(messageLooksToolIntent('¿Tienen el SKU ABC-123 en bodega?')).toBe(true);
  });

  it('detecta pedido de contacto y HubSpot en el perfil', () => {
    expect(messageLooksContactIntent('vale gracias como me contacto?')).toBe(true);
    expect(messageLooksContactIntent('cuánto cuesta el plan?')).toBe(false);
    const profile = buildAgentCapabilityProfile({
      agent: {
        name: 'Asesor Taller',
        enabledMcpToolIds: ['mcp:hubspot:hubspot_create_contact'],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    expect(
      memberHasHubspotCapability({
        name: 'Asesor Taller',
        description: '',
        role: 'orchestrator',
        capabilities: profile,
      }),
    ).toBe(true);
  });

  it('indexa hojas google-sheets como capacidad sheet', () => {
    const profile = buildAgentCapabilityProfile({
      agent: {
        name: 'Asesor Taller',
        tools: [
          {
            toolId: 'google-sheets',
            config: {
              sheets: [
                {
                  id: 'sh_1',
                  name: 'ventas',
                  description: 'Inventario de repuestos y stock por sede',
                  matrixNeed: 'marca, modelo, referencia, stock, sede',
                  url: 'https://docs.google.com/spreadsheets/d/abc/edit',
                },
              ],
            },
          },
        ],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    expect(profile.items.some((i) => i.kind === 'sheet' && i.id === 'ventas')).toBe(true);
    expect(profile.toolSignals).toContain('inventario');
  });

  it('scoreMemberCapabilityMatch prioriza financiero sobre mongo en asesoría', () => {
    const financeProfile = buildAgentCapabilityProfile({
      agent: {
        name: 'asesor financiero',
        description: 'eres capaz de consultar flujos externos y financiero muy capaz',
        systemPrompt: 'Eres un asesor financiero personal. Ayudas a mejorar finanzas, crédito, ahorro.',
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
      scheduledTasks: [{ name: 'inversion', actionType: 'webhook', enabled: true }],
    });
    const mongoProfile = buildAgentCapabilityProfile({
      agent: {
        name: 'mongo agent',
        description: 'sabes de qa',
        systemPrompt: 'eres experto en qa',
        enabledMcpToolIds: ['mcp:mongodb:mongo_find'],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const msg = 'como puedo mejorar mis finanzas personales';
    const financeScore = scoreMemberCapabilityMatch(msg, {
      id: 'o1',
      name: 'asesor financiero',
      description: 'finanzas',
      hubId: 'asesor-financiero',
      role: 'orchestrator',
      capabilities: financeProfile,
    }, { memberId: 'o1', primaryOrchestratorId: 'o1' });
    const mongoScore = scoreMemberCapabilityMatch(msg, {
      id: 'o2',
      name: 'mongo agent',
      description: 'qa',
      hubId: 'mongo-agent',
      role: 'orchestrator',
      capabilities: mongoProfile,
    }, { memberId: 'o2', primaryOrchestratorId: 'o1' });
    expect(financeScore).toBeGreaterThan(mongoScore);
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
