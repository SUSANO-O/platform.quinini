import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMultiAgentStatusMessage,
  buildParallelSynthesisPrompt,
  buildPipelineCreativePrompt,
  buildWidgetMultiAgentConfig,
  findOrchestratorForMember,
  isCompoundCreativeRequest,
  isMultiAgentPlanEligible,
  pickPipelineAgents,
  resolveHubAgentId,
  resolveParallelContributors,
  resolveRoutableHubAgentId,
  resolveWidgetRoutingCapabilities,
  shouldSkipMultiAgentForTrivialTurn,
  triageByKeywords,
  triageWidgetMessage,
  overrideTriageForInventorySheets,
  overrideTriageForInventoryFollowUp,
  overrideTriageForCrmOnOrchestrator,
  validateMultiAgentMode,
  type TeamMember,
} from '../widget-multi-agent';
import { buildAgentCapabilityProfile } from '../widget-agent-capabilities';
import { DEFAULT_AGENT_SKILLS_CATALOG } from '../agent-skills-catalog-defaults';
import {
  isContentCapableAgent,
  isCreativeCapableAgent,
  validatePipelineWidgetSetup,
} from '../widget-pipeline-ui';

describe('widget-multi-agent', () => {
  it('salta triaje multiagente en saludos y ecos cortos', () => {
    expect(shouldSkipMultiAgentForTrivialTurn('Hola')).toBe(true);
    expect(shouldSkipMultiAgentForTrivialTurn('gracias', [{ role: 'model', content: 'Listo' }])).toBe(true);
    expect(
      shouldSkipMultiAgentForTrivialTurn('ok', [{ role: 'model', content: '¿Agendo el peritaje?' }]),
    ).toBe(false);
  });

  it('Business y Enterprise pueden usar multi-agente', () => {
    expect(isMultiAgentPlanEligible('business')).toBe(true);
    expect(isMultiAgentPlanEligible('enterprise')).toBe(true);
    expect(isMultiAgentPlanEligible('growth')).toBe(false);
    expect(isMultiAgentPlanEligible('starter')).toBe(false);
  });

  it('triaje por keywords deriva billing al especialista con capacidad financiera', () => {
    const billingCaps = buildAgentCapabilityProfile({
      agent: {
        name: 'Closer Financiero & Peritaje',
        skillsConfig: [
          {
            id: 'customer_service',
            enabled: true,
            config: { prompt_extension: 'Gestión de reembolsos, cobros y suscripciones.' },
          },
        ],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const team: TeamMember[] = [
      { id: 'o1', hubId: 'hub-o', name: 'Ventas', description: 'vehículos', role: 'orchestrator' },
      {
        id: 's1',
        hubId: 'hub-f',
        name: 'Closer Financiero & Peritaje',
        description: '',
        role: 'specialist',
        capabilities: billingCaps,
      },
    ];
    const result = triageByKeywords('Necesito un reembolso de mi suscripción', team);
    expect(result.target.id).toBe('s1');
    expect(result.method).toBe('keyword');
  });

  it('overrideTriageForInventorySheets mantiene orquestador con hoja de inventario', () => {
    const orchCaps = buildAgentCapabilityProfile({
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
                  description: 'Inventario repuestos',
                  url: 'https://docs.google.com/spreadsheets/d/abc/edit',
                },
              ],
            },
          },
        ],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const closerCaps = buildAgentCapabilityProfile({
      agent: {
        name: 'Closer Financiero',
        skillsConfig: [{ id: 'sales_closer', enabled: true }],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const team: TeamMember[] = [
      {
        id: 'o1',
        hubId: 'ventas',
        name: 'Asesor Taller',
        description: 'repuestos',
        role: 'orchestrator',
        capabilities: orchCaps,
      },
      {
        id: 's1',
        hubId: 'closer',
        name: 'Closer Financiero',
        description: 'financiamiento',
        role: 'specialist',
        capabilities: closerCaps,
      },
    ];
    const wrong = triageByKeywords(
      'Busca en el inventario amortiguador Tracker 2017 Gabriel',
      team,
      'o1',
    );
    const fixed = overrideTriageForInventorySheets(
      'Busca en el inventario amortiguador Tracker 2017 Gabriel',
      team,
      wrong,
      'o1',
    );
    expect(fixed.target.id).toBe('o1');
  });

  it('override de follow-up de hoja no deriva promoción/cuál al closer sin tools', () => {
    const orchCaps = buildAgentCapabilityProfile({
      agent: {
        name: 'Asesor Taller',
        tools: [
          {
            toolId: 'google-sheets',
            config: {
              sheets: [
                {
                  id: 'sh_1',
                  name: 'sheet_1',
                  description: 'Inventario',
                  url: 'https://docs.google.com/spreadsheets/d/abc/edit',
                },
              ],
            },
          },
        ],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const closerCaps = buildAgentCapabilityProfile({
      agent: {
        name: 'Closer Financiero & Peritaje',
        skillsConfig: [{ id: 'sales_closer', enabled: true }],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const team: TeamMember[] = [
      {
        id: 'o1',
        hubId: 'ventas',
        name: 'Asesor Taller',
        description: 'taller',
        role: 'orchestrator',
        capabilities: orchCaps,
      },
      {
        id: 's1',
        hubId: 'closer',
        name: 'Closer Financiero & Peritaje',
        description: 'financiamiento',
        role: 'specialist',
        capabilities: closerCaps,
      },
    ];
    const history = [
      {
        role: 'model',
        content:
          'Sí, lo tenemos. Referencia 474-B5869, 6 unidades en stock, Bodega Principal - Pasillo B, $1.056.000 (aplica promoción).',
      },
    ];
    const wrong = { target: team[1]!, method: 'llm' as const, score: 8 };
    const cual = overrideTriageForInventoryFollowUp('cual', team, wrong, 'o1', history);
    expect(cual.target.id).toBe('o1');
    const promo = overrideTriageForInventoryFollowUp(
      'que hago para la promocion?',
      team,
      wrong,
      'o1',
      history,
    );
    expect(promo.target.id).toBe('o1');
  });

  it('override de CRM mantiene orquestador con HubSpot si el closer no lo tiene', () => {
    const orchCaps = buildAgentCapabilityProfile({
      agent: {
        name: 'Asesor Taller',
        enabledMcpToolIds: [
          'mcp:hubspot:hubspot_search_contacts',
          'mcp:hubspot:hubspot_create_contact',
        ],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const closerCaps = buildAgentCapabilityProfile({
      agent: { name: 'Closer Financiero & Peritaje' },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const team: TeamMember[] = [
      {
        id: 'o1',
        hubId: 'ventas',
        name: 'Asesor Taller',
        description: 'taller',
        role: 'orchestrator',
        capabilities: orchCaps,
      },
      {
        id: 's1',
        hubId: 'closer',
        name: 'Closer Financiero & Peritaje',
        description: 'financiamiento',
        role: 'specialist',
        capabilities: closerCaps,
      },
    ];
    const wrong = { target: team[1]!, method: 'llm' as const, score: 8 };
    const fixed = overrideTriageForCrmOnOrchestrator(
      'vale gracias como me contacto?',
      team,
      wrong,
      'o1',
    );
    expect(fixed.target.id).toBe('o1');
  });

  it('triaje por keywords deriva a billing con descripción', () => {
    const billingCaps = buildAgentCapabilityProfile({
      agent: { name: 'Billing', description: 'facturación y reembolsos' },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const team: TeamMember[] = [
      { id: 'o1', hubId: 'hub-o', name: 'Recepción', description: 'triaje general', role: 'orchestrator' },
      {
        id: 's1',
        hubId: 'hub-b',
        name: 'Billing',
        description: 'facturación y reembolsos',
        role: 'specialist',
        capabilities: billingCaps,
      },
      { id: 's2', hubId: 'hub-v', name: 'Ventas', description: 'planes y precios', role: 'specialist' },
    ];
    const result = triageByKeywords('Necesito un reembolso de mi suscripción', team);
    expect(result.target.id).toBe('s1');
    expect(result.method).toBe('keyword');
  });

  it('sin señal clara usa orquestador', () => {
    const team: TeamMember[] = [
      { id: 'o1', hubId: 'hub-o', name: 'Recepción', description: 'triaje', role: 'orchestrator' },
      { id: 's1', hubId: 'hub-b', name: 'Billing', description: 'facturación', role: 'specialist' },
    ];
    const result = triageByKeywords('hola', team);
    expect(result.target.id).toBe('o1');
    expect(result.method).toBe('default');
  });

  it('triaje no envía a mongo cuando el usuario pregunta "sabes de finanzas"', () => {
    const financeCaps = buildAgentCapabilityProfile({
      agent: {
        name: 'asesor financiero',
        description: 'eres capaz de consultar flujos externos y financiero muy capaz',
        systemPrompt: 'Eres un asesor financiero personal. Ayudas a mejorar finanzas, crédito y ahorro.',
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const mongoCaps = buildAgentCapabilityProfile({
      agent: {
        name: 'mongo agent',
        description: 'sabes de qa',
        systemPrompt: 'eres experto en qa daras respuestas correctas',
        enabledMcpToolIds: ['mcp:mongodb:mongo_find'],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const team: TeamMember[] = [
      {
        id: 'o1',
        hubId: 'asesor-financiero',
        name: 'asesor financiero',
        description: 'financiero muy capaz',
        role: 'orchestrator',
        capabilities: financeCaps,
      },
      {
        id: 'o2',
        hubId: 'mongo-agent',
        name: 'mongo agent',
        description: 'sabes de qa',
        role: 'orchestrator',
        capabilities: mongoCaps,
      },
    ];
    const result = triageByKeywords('hola sabes de finanzas', team, 'o1');
    expect(result.target.id).toBe('o1');
  });

  it('triaje mantiene asesor financiero ante consulta de finanzas (no mongo)', () => {
    const financeCaps = buildAgentCapabilityProfile({
      agent: {
        name: 'asesor financiero',
        description: 'eres capaz de consultar flujos externos y financiero muy capaz',
        systemPrompt: 'Eres un asesor financiero personal. Ayudas a mejorar finanzas, crédito y ahorro.',
        tools: [{ toolId: 'webhook', config: { webhooks: [{ name: 'noticias' }] } }],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const mongoCaps = buildAgentCapabilityProfile({
      agent: {
        name: 'mongo agent',
        agentHubId: 'mongo-agent',
        systemPrompt: 'eres experto en qa',
        enabledMcpToolIds: ['mcp:mongodb:mongo_find'],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const team: TeamMember[] = [
      {
        id: 'o1',
        hubId: 'asesor-financiero',
        name: 'asesor financiero',
        description: 'consultas financieras',
        role: 'orchestrator',
        capabilities: financeCaps,
      },
      {
        id: 'o2',
        hubId: 'mongo-agent',
        name: 'mongo agent',
        description: 'sabes de qa',
        role: 'orchestrator',
        capabilities: mongoCaps,
      },
    ];
    const result = triageByKeywords('como puedo mejorar mis finanzas personales', team, 'o1');
    expect(result.target.id).toBe('o1');
    expect(result.method).toBe('keyword');
  });

  it('triaje deriva preguntas de base de datos al agente con MCP mongo', () => {
    const mongoCaps = buildAgentCapabilityProfile({
      agent: {
        name: 'mongo agent',
        agentHubId: 'mongo-agent',
        enabledMcpToolIds: ['mcp:mongodb:mongo_find'],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const financeCaps = buildAgentCapabilityProfile({
      agent: {
        name: 'asesor financiero',
        tools: [{ toolId: 'webhook', config: { webhooks: [{ name: 'noticias' }] } }],
      },
      skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
    });
    const team: TeamMember[] = [
      {
        id: 'o1',
        hubId: 'asesor-financiero',
        name: 'asesor financiero',
        description: 'consultas financieras',
        role: 'orchestrator',
        capabilities: financeCaps,
      },
      { id: 's1', hubId: 'orquestador', name: 'orquestador', description: '', role: 'specialist' },
      {
        id: 'o2',
        hubId: 'mongo-agent',
        name: 'mongo agent',
        description: 'sabes de qa',
        role: 'orchestrator',
        capabilities: mongoCaps,
      },
    ];
    const result = triageByKeywords('tienes coneccion a base de datos ?', team, 'o1');
    expect(result.target.id).toBe('o2');
    expect(result.method).toBe('keyword');
  });

  it('triaje prioriza especialista cuando el mensaje menciona su nombre', () => {
    const team: TeamMember[] = [
      {
        id: 'o1',
        hubId: 'hub-o',
        name: 'asesor financiero',
        description: 'consultas financieras',
        role: 'orchestrator',
      },
      { id: 's1', hubId: 'hub-orch', name: 'orquestador', description: '', role: 'specialist' },
    ];
    const result = triageByKeywords(
      'Hola orquestador, necesito asesoría sobre crédito hipotecario y tasa EA',
      team,
    );
    expect(result.target.id).toBe('s1');
    expect(result.method).toBe('keyword');
  });

  it('resolveParallelContributors usa orquestador principal con 2.º orquestador', () => {
    const primary: TeamMember = {
      id: 'o1',
      hubId: 'asesor-financiero',
      name: 'asesor financiero',
      description: '',
      role: 'orchestrator',
    };
    const mongo: TeamMember = {
      id: 'o2',
      hubId: 'mongo-agent',
      name: 'mongo agent',
      description: '',
      role: 'orchestrator',
    };
    const pair = resolveParallelContributors([primary, mongo], primary, mongo);
    expect(pair.orchestrator.id).toBe('o1');
    expect(pair.specialist.id).toBe('o2');
  });

  it('validateMultiAgentMode acepta pipeline', () => {
    expect(validateMultiAgentMode('parallel')).toBe('parallel');
    expect(validateMultiAgentMode('pipeline')).toBe('pipeline');
    expect(validateMultiAgentMode('triage')).toBe('triage');
    expect(validateMultiAgentMode('other')).toBe('triage');
  });

  it('buildParallelSynthesisPrompt incluye ambos agentes', () => {
    const prompt = buildParallelSynthesisPrompt({
      userMessage: 'Necesito reembolso',
      orchestratorName: 'Recepción',
      specialistName: 'Billing',
      orchestratorReply: 'Te ayudo con eso.',
      specialistReply: 'Proceso de reembolso en 5 días.',
    });
    expect(prompt).toContain('Recepción');
    expect(prompt).toContain('Billing');
    expect(prompt).toContain('Necesito reembolso');
  });

  it('buildMultiAgentStatusMessage para handoff incluye especialista', () => {
    expect(buildMultiAgentStatusMessage('handoff', 'Billing')).toContain('Billing');
    expect(buildMultiAgentStatusMessage('parallel')).toContain('paralelo');
  });

  it('resolveHubAgentId solo devuelve hubId del catálogo', () => {
    const withHub: TeamMember = {
      id: 'abc123',
      hubId: 'ventas',
      name: 'Orq',
      description: '',
      role: 'orchestrator',
    };
    const withoutHub: TeamMember = {
      id: 'abc123',
      hubId: null,
      name: 'Sub',
      description: '',
      role: 'specialist',
    };
    expect(resolveHubAgentId(withHub)).toBe('ventas');
    expect(resolveHubAgentId(withoutHub)).toBeNull();
  });

  it('resolveRoutableHubAgentId evita handoff sin hubId del especialista', () => {
    const orchestrator: TeamMember = {
      id: 'o1',
      hubId: 'hub-o',
      name: 'Orq',
      description: '',
      role: 'orchestrator',
    };
    const specialist: TeamMember = {
      id: 's1',
      hubId: null,
      name: 'Sub',
      description: '',
      role: 'specialist',
    };
    const route = resolveRoutableHubAgentId(orchestrator, specialist);
    expect(route?.handoff).toBe(false);
    expect(route?.hubId).toBe('hub-o');
    expect(route?.handoffSkippedReason).toBe('specialist_not_synced');
  });

  it('resolveRoutableHubAgentId enruta al especialista con hubId', () => {
    const orchestrator: TeamMember = {
      id: 'o1',
      hubId: 'hub-o',
      name: 'Orq',
      description: '',
      role: 'orchestrator',
    };
    const specialist: TeamMember = {
      id: 's1',
      hubId: 'hub-s',
      name: 'Billing',
      description: '',
      role: 'specialist',
    };
    const route = resolveRoutableHubAgentId(orchestrator, specialist);
    expect(route?.handoff).toBe(true);
    expect(route?.hubId).toBe('hub-s');
  });

  it('resolveWidgetRoutingCapabilities activa triaje automático con subs sin toggle', () => {
    const team: TeamMember[] = [
      { id: 'o1', hubId: 'hub-o', name: 'Orq', description: '', role: 'orchestrator' },
      { id: 's1', hubId: 'hub-s', name: 'Sub', description: '', role: 'specialist', parentOrchestratorId: 'o1' },
    ];
    const config = buildWidgetMultiAgentConfig({
      agentId: 'o1',
      multiAgentEnabled: false,
      agentIds: [],
      orchestratorAgentIds: [],
    });
    const caps = resolveWidgetRoutingCapabilities(config, team, 'starter');
    expect(caps.autoSubAgents).toBe(true);
    expect(caps.triage).toBe(true);
    expect(caps.parallel).toBe(false);
  });

  it('resolveWidgetRoutingCapabilities habilita multi-orquestador solo con toggle premium', () => {
    const team: TeamMember[] = [
      { id: 'o1', hubId: 'hub-o', name: 'Orq A', description: '', role: 'orchestrator' },
      { id: 'o2', hubId: 'hub-b', name: 'Orq B', description: '', role: 'orchestrator' },
      { id: 's1', hubId: 'hub-s', name: 'Sub', description: '', role: 'specialist', parentOrchestratorId: 'o1' },
    ];
    const config = buildWidgetMultiAgentConfig({
      agentId: 'o1',
      multiAgentEnabled: true,
      multiAgentMode: 'parallel',
      orchestratorAgentIds: ['o2'],
    });
    const caps = resolveWidgetRoutingCapabilities(config, team, 'business');
    expect(caps.multiOrchestrator).toBe(true);
    expect(caps.triage).toBe(true);
    expect(caps.parallel).toBe(true);
  });

  it('findOrchestratorForMember devuelve el padre del especialista', () => {
    const team: TeamMember[] = [
      { id: 'o1', hubId: 'hub-o', name: 'Orq A', description: '', role: 'orchestrator' },
      { id: 'o2', hubId: 'hub-b', name: 'Orq B', description: '', role: 'orchestrator' },
      { id: 's1', hubId: 'hub-s', name: 'Sub', description: '', role: 'specialist', parentOrchestratorId: 'o2' },
    ];
    const specialist = team[2];
    expect(findOrchestratorForMember(team, specialist).id).toBe('o2');
  });

  it('isCompoundCreativeRequest detecta banner + producto', () => {
    expect(
      isCompoundCreativeRequest('Hazme un banner 1200x628 con la información de los autos familiares'),
    ).toBe(true);
    expect(isCompoundCreativeRequest('¿Cuánto cuesta el plan anual?')).toBe(false);
    expect(isCompoundCreativeRequest('Genera un logo')).toBe(false);
  });

  it('pickPipelineAgents con 2 orquestadores usa el otro como creativo aunque no tenga keywords visuales', () => {
    const team: TeamMember[] = [
      {
        id: 'v1',
        hubId: 'ventas',
        name: 'Vendedor Autos',
        description: 'ventas catálogo autos familiares precios',
        role: 'orchestrator',
      },
      {
        id: 'i1',
        hubId: 'imagen',
        name: 'Proton AI',
        description: 'asistente general de la plataforma',
        role: 'orchestrator',
      },
    ];
    const pair = pickPipelineAgents(
      'Hazme un banner 1200x628 con la informacion de los autos familiares',
      team,
    );
    expect(pair?.content.id).toBe('v1');
    expect(pair?.creative.id).toBe('i1');
  });

  it('pickPipelineAgents elige vendedor e imagen en mensaje mixto', () => {
    const team: TeamMember[] = [
      {
        id: 'v1',
        hubId: 'ventas',
        name: 'Vendedor Autos',
        description: 'ventas catálogo autos familiares precios',
        role: 'orchestrator',
      },
      {
        id: 'i1',
        hubId: 'imagen',
        name: 'Creativos Banner',
        description: 'generación de imágenes banners diseño gráfico',
        role: 'orchestrator',
      },
    ];
    const pair = pickPipelineAgents(
      'Hazme un banner 1200x628 con la información de los autos familiares',
      team,
    );
    expect(pair?.content.id).toBe('v1');
    expect(pair?.creative.id).toBe('i1');
  });

  it('resolveWidgetRoutingCapabilities habilita pipeline con toggle premium', () => {
    const team: TeamMember[] = [
      { id: 'o1', hubId: 'hub-o', name: 'Orq A', description: '', role: 'orchestrator' },
      { id: 'o2', hubId: 'hub-b', name: 'Orq B', description: '', role: 'orchestrator' },
    ];
    const config = buildWidgetMultiAgentConfig({
      agentId: 'o1',
      multiAgentEnabled: true,
      multiAgentMode: 'pipeline',
      orchestratorAgentIds: ['o2'],
    });
    const caps = resolveWidgetRoutingCapabilities(config, team, 'business');
    expect(caps.pipeline).toBe(true);
  });

  it('buildPipelineCreativePrompt incluye brief de contenido', () => {
    const prompt = buildPipelineCreativePrompt({
      userMessage: 'Banner 1200x628 autos familiares',
      contentBrief: '- Modelo X: 7 plazas\n- Desde $399/mes',
      contentAgentName: 'Vendedor',
    });
    expect(prompt).toContain('Modelo X');
    expect(prompt).toContain('Banner 1200x628');
  });

  it('isCreativeCapableAgent detecta modelo de imagen y perfil creativo', () => {
    expect(isCreativeCapableAgent({ name: 'Profesor inglés', description: 'clases de gramática' })).toBe(false);
    expect(
      isCreativeCapableAgent({ name: 'Diseño', description: 'banners e imágenes para marketing' }),
    ).toBe(true);
    expect(isCreativeCapableAgent({ name: 'Gen', model: 'vx/imagen-3.0-generate-001' })).toBe(true);
  });

  it('validatePipelineWidgetSetup advierte cuando falta agente creativo', () => {
    const agents = {
      ingles: { name: 'Profesor inglés', description: 'clases y vocabulario' },
      finanzas: { name: 'Finanzas', description: 'inversiones y presupuesto' },
    };
    const v = validatePipelineWidgetSetup(['ingles', 'finanzas'], (id) => agents[id as keyof typeof agents]);
    expect(v.ok).toBe(false);
    expect(v.creativeAgentNames).toHaveLength(0);
    expect(v.warnings.some((w) => w.includes('creativo'))).toBe(true);
  });

  it('validatePipelineWidgetSetup ok con vendedor + diseño', () => {
    const agents = {
      ventas: { name: 'AutoExpert', description: 'ventas catálogo autos' },
      arte: { name: 'Studio', description: 'banners e imágenes' },
    };
    const v = validatePipelineWidgetSetup(['ventas', 'arte'], (id) => agents[id as keyof typeof agents]);
    expect(v.ok).toBe(true);
    expect(v.contentAgentNames).toContain('AutoExpert');
    expect(v.creativeAgentNames).toContain('Studio');
  });

  describe('triageWidgetMessage — evita llamar al LLM cuando el keyword-match ya es definitivo', () => {
    const originalBackendUrl = process.env.BACKEND_URL;
    const originalFetch = global.fetch;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // BACKEND_URL presente ⇒ si el código llamara al LLM, sí intentaría el fetch
      // (getAibackhubBaseUrl() no corta antes). Así el mock es un chequeo real.
      process.env.BACKEND_URL = 'http://127.0.0.1:9003';
      fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: '{"agentId":"should-not-be-used"}' }), { status: 200 }),
      );
      global.fetch = fetchMock as unknown as typeof global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
      if (originalBackendUrl === undefined) delete process.env.BACKEND_URL;
      else process.env.BACKEND_URL = originalBackendUrl;
    });

    it('kwScore >= 10 (match directo de especialista): no llama al LLM y rutea por keyword', async () => {
      const billingCaps = buildAgentCapabilityProfile({
        agent: {
          name: 'Closer Financiero & Peritaje',
          skillsConfig: [
            {
              id: 'customer_service',
              enabled: true,
              config: { prompt_extension: 'Gestión de reembolsos, cobros y suscripciones.' },
            },
          ],
        },
        skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
      });
      const team: TeamMember[] = [
        { id: 'o1', hubId: 'hub-o', name: 'Ventas', description: 'vehículos', role: 'orchestrator' },
        {
          id: 's1',
          hubId: 'hub-f',
          name: 'Closer Financiero & Peritaje',
          description: '',
          role: 'specialist',
          capabilities: billingCaps,
        },
      ];
      const message = 'Necesito un reembolso de mi suscripción';

      // Precondición documentada: este mensaje sí produce kwScore >= 10 por keyword.
      const kw = triageByKeywords(message, team, 'o1');
      expect(kw.score ?? 0).toBeGreaterThanOrEqual(10);

      const result = await triageWidgetMessage(message, team, 'o1');

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.method).toBe('keyword');
      expect(result.target.id).toBe('s1');
    });

    it('kwScore >= 6 y target = orquestador principal: no llama al LLM y rutea al orquestador', async () => {
      const billingCaps = buildAgentCapabilityProfile({
        agent: { name: 'Billing', description: 'facturación y pagos' },
        skillCatalog: DEFAULT_AGENT_SKILLS_CATALOG,
      });
      const team: TeamMember[] = [
        { id: 'o1', hubId: 'hub-o', name: 'Recepción', description: 'atención general', role: 'orchestrator' },
        {
          id: 's1',
          hubId: 'hub-b',
          name: 'Billing',
          description: 'facturación y pagos',
          role: 'specialist',
          capabilities: billingCaps,
        },
      ];
      const message = 'una consulta variada sobre el servicio';

      const kw = triageByKeywords(message, team, 'o1');
      expect(kw.method).toBe('keyword');
      expect(kw.target.id).toBe('o1');
      expect(kw.score ?? 0).toBeGreaterThanOrEqual(6);
      expect(kw.score ?? 0).toBeLessThan(10);

      const result = await triageWidgetMessage(message, team, 'o1');

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.method).toBe('keyword');
      expect(result.target.id).toBe('o1');
    });

    it('sin match de keyword (score bajo, sin orquestador principal): sí consulta al LLM como antes', async () => {
      const team: TeamMember[] = [
        { id: 'o1', hubId: 'hub-o', name: 'Recepción', description: 'atención general', role: 'orchestrator' },
        { id: 's1', hubId: 'hub-s', name: 'Soporte', description: 'soporte técnico', role: 'specialist' },
      ];
      const message = 'una consulta variada sobre el servicio';

      // Sin primaryOrchestratorId: el fallback que sube el score del orquestador no aplica.
      const kw = triageByKeywords(message, team);
      expect(kw.score ?? 0).toBeLessThan(6);

      await triageWidgetMessage(message, team);

      expect(fetchMock).toHaveBeenCalled();
    });
  });
});
