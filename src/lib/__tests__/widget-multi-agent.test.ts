import { describe, expect, it } from 'vitest';
import {
  buildMultiAgentStatusMessage,
  buildParallelSynthesisPrompt,
  isMultiAgentPlanEligible,
  resolveHubAgentId,
  resolveRoutableHubAgentId,
  triageByKeywords,
  validateMultiAgentMode,
  type TeamMember,
} from '../widget-multi-agent';

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

  it('validateMultiAgentMode solo acepta parallel explícito', () => {
    expect(validateMultiAgentMode('parallel')).toBe('parallel');
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
});
