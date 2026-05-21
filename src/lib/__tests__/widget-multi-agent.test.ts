import { describe, expect, it } from 'vitest';
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
  resolveRoutableHubAgentId,
  resolveWidgetRoutingCapabilities,
  triageByKeywords,
  validateMultiAgentMode,
  type TeamMember,
} from '../widget-multi-agent';
import {
  isContentCapableAgent,
  isCreativeCapableAgent,
  validatePipelineWidgetSetup,
} from '../widget-pipeline-ui';

describe('widget-multi-agent', () => {
  it('Business y Enterprise pueden usar multi-agente', () => {
    expect(isMultiAgentPlanEligible('business')).toBe(true);
    expect(isMultiAgentPlanEligible('enterprise')).toBe(true);
    expect(isMultiAgentPlanEligible('growth')).toBe(false);
    expect(isMultiAgentPlanEligible('starter')).toBe(false);
  });

  it('triaje por keywords deriva billing al especialista financiero aunque falte descripción', () => {
    const team: TeamMember[] = [
      { id: 'o1', hubId: 'hub-o', name: 'Ventas', description: 'vehículos', role: 'orchestrator' },
      {
        id: 's1',
        hubId: 'hub-f',
        name: 'Closer Financiero & Peritaje',
        description: '',
        role: 'specialist',
      },
    ];
    const result = triageByKeywords('Necesito un reembolso de mi suscripción', team);
    expect(result.target.id).toBe('s1');
    expect(result.method).toBe('keyword');
  });

  it('triaje por keywords deriva a billing con descripción', () => {
    const team: TeamMember[] = [
      { id: 'o1', hubId: 'hub-o', name: 'Recepción', description: 'triaje general', role: 'orchestrator' },
      { id: 's1', hubId: 'hub-b', name: 'Billing', description: 'facturación y reembolsos', role: 'specialist' },
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
});
