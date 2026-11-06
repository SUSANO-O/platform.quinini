import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Un agente solo (sin especialistas ni otro orquestador) no tiene equipo que enrutar: el chat no debe
 * pagar en cada turno la sincronización de equipo ni la consulta al hub (~0,6 s medidos en producción).
 * Con especialistas, el equipo se sigue armando y enriqueciendo como siempre.
 */
const clientAgentFind = vi.fn();
const scheduledFind = vi.fn();
const listSkillCatalog = vi.fn();
const fetchCatalogAgentFromHub = vi.fn();
const ensureClientAgentHubSynced = vi.fn();

vi.mock('@/lib/db/models', () => ({
  ClientAgent: { find: (...a: unknown[]) => clientAgentFind(...a) },
  ScheduledTask: { find: (...a: unknown[]) => scheduledFind(...a) },
}));
vi.mock('@/lib/skill-catalog-service', () => ({ listSkillCatalog: () => listSkillCatalog() }));
vi.mock('@/lib/aibackhub-sync', () => ({
  fetchCatalogAgentFromHub: (...a: unknown[]) => fetchCatalogAgentFromHub(...a),
  ensureClientAgentHubSynced: (...a: unknown[]) => ensureClientAgentHubSynced(...a),
  getAibackhubBaseUrl: () => 'http://hub.test',
  getAgentflowhubBaseUrl: () => 'http://afh.test',
  hubCreateHeaders: () => ({}),
}));

import { applyMultiAgentRouting, buildWidgetMultiAgentConfig, loadWidgetTeam } from '@/lib/widget-multi-agent';

const ORCH = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SPEC = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function chain<T>(rows: T[]) {
  return { select: () => ({ lean: () => Promise.resolve(rows) }) };
}

function agents(orchestrator: Record<string, unknown>, specialists: Record<string, unknown>[] = []) {
  clientAgentFind.mockImplementation((q: { type?: string }) => chain(q.type === 'agent' ? [orchestrator] : specialists));
}

beforeEach(() => {
  clientAgentFind.mockReset();
  scheduledFind.mockReset().mockReturnValue(chain([]));
  listSkillCatalog.mockReset().mockResolvedValue([]);
  fetchCatalogAgentFromHub.mockReset().mockResolvedValue(null);
  ensureClientAgentHubSynced.mockReset().mockResolvedValue('hub-x');
});

describe('loadWidgetTeam — agente solo', () => {
  it('sin especialistas no sincroniza, no consulta el hub ni lee catálogo/tareas', async () => {
    agents({ _id: ORCH, name: 'Solo', subAgentIds: [] });
    const team = await loadWidgetTeam(buildWidgetMultiAgentConfig({ agentId: ORCH }), 'u1');
    expect(team.length).toBeLessThanOrEqual(1);
    expect(fetchCatalogAgentFromHub).not.toHaveBeenCalled();
    expect(ensureClientAgentHubSynced).not.toHaveBeenCalled();
    expect(listSkillCatalog).not.toHaveBeenCalled();
    expect(scheduledFind).not.toHaveBeenCalled();
  });

  it('applyMultiAgentRouting con agente solo devuelve null (sin enrutar) igual que antes', async () => {
    agents({ _id: ORCH, name: 'Solo', subAgentIds: [] });
    const out = await applyMultiAgentRouting({
      rawBody: JSON.stringify({ message: '¿Cómo veo la ruta de ayer de mi carro?', agentId: ORCH }),
      config: buildWidgetMultiAgentConfig({ agentId: ORCH }),
      userId: 'u1',
      plan: 'business',
    });
    expect(out).toBeNull();
    expect(fetchCatalogAgentFromHub).not.toHaveBeenCalled();
  });

  it('con un especialista el equipo se arma y enriquece como siempre', async () => {
    agents({ _id: ORCH, name: 'Orq', subAgentIds: [SPEC] }, [{ _id: SPEC, name: 'Esp', agentHubId: 'hub-spec' }]);
    const team = await loadWidgetTeam(buildWidgetMultiAgentConfig({ agentId: ORCH }), 'u1');
    expect(team.map((m) => m.role)).toEqual(['orchestrator', 'specialist']);
    expect(listSkillCatalog).toHaveBeenCalled();
    expect(fetchCatalogAgentFromHub).toHaveBeenCalled();
  });
});
