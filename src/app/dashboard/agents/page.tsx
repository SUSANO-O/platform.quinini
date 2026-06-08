'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { useSubscription } from '@/hooks/use-subscription';
import { useClientModels } from '@/hooks/use-client-models';
import { getAgentLimits, isAgentLimitReached } from '@/lib/agent-plans';
import { Bot, Plus, Sparkles, Globe2 } from 'lucide-react';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AgentListCard, type AgentListItem } from '@/components/dashboard/agent-list-card';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header';
import { DashboardCallout } from '@/components/dashboard/dashboard-callout';
import { DashboardEmptyState } from '@/components/dashboard/dashboard-empty-state';
import { DashboardButton, DashboardButtonLink } from '@/components/dashboard/dashboard-button';
import { DashboardFilterMenu } from '@/components/dashboard/dashboard-filter-menu';
import { DashboardGridToolbar } from '@/components/dashboard/dashboard-grid-toolbar';
import { BackgroundRefreshIndicator } from '@/components/dashboard/background-refresh-indicator';
import { dashboardKeys } from '@/lib/dashboard-query-keys';
import { fetchAgentsList } from '@/lib/dashboard-fetch';

type AgentFilter = 'all' | 'active' | 'inactive' | 'platform';

const AGENT_FILTER_OPTIONS: { value: AgentFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
  { value: 'platform', label: 'Plataforma' },
];

function filterByStatus(list: AgentListItem[], filter: AgentFilter): AgentListItem[] {
  if (filter === 'active') return list.filter((a) => a.status === 'active');
  if (filter === 'inactive') return list.filter((a) => a.status === 'disabled');
  return list;
}

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const { subscription } = useSubscription();
  const plan = subscription?.plan ?? 'free';
  const limits = getAgentLimits(plan);

  const agentsQuery = useQuery({
    queryKey: dashboardKeys.agents(),
    queryFn: fetchAgentsList,
  });
  const agents = (agentsQuery.data ?? []) as unknown as AgentListItem[];
  const loading = agentsQuery.isLoading && agents.length === 0;
  const fetchError = agentsQuery.isError
    ? (agentsQuery.error instanceof Error ? agentsQuery.error.message : 'Error de red')
    : null;
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentListItem | null>(null);
  const [filter, setFilter] = useState<AgentFilter>('all');
  const { models: clientModels } = useClientModels(plan);

  const modelLabelById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of clientModels) {
      m[c.id] = c.name;
    }
    return m;
  }, [clientModels]);

  const getModelLabel = (modelId: string) => modelLabelById[modelId] ?? modelId;

  const mainAgents = useMemo(() => agents.filter((a) => a.type === 'agent'), [agents]);
  const mineAgents = useMemo(() => mainAgents.filter((a) => !a.isPlatform), [mainAgents]);
  const catalogPlatformAgents = useMemo(
    () => mainAgents.filter((a) => a.isPlatform === true),
    [mainAgents],
  );

  const filteredMine = useMemo(
    () => filterByStatus(mineAgents, filter),
    [mineAgents, filter],
  );
  const filteredPlatform = useMemo(
    () => filterByStatus(catalogPlatformAgents, filter === 'platform' ? 'all' : filter),
    [catalogPlatformAgents, filter],
  );

  const usedAgents = mineAgents.length;
  const unlimitedAgents = limits.agents < 0;
  const atLimit = isAgentLimitReached(usedAgents, limits.agents);
  const pct = unlimitedAgents ? 0 : Math.min(100, (usedAgents / limits.agents) * 100);
  const agentLimitLabel = unlimitedAgents ? 'Ilimitados' : String(limits.agents);

  const showMineSection = filter !== 'platform';
  const showPlatformSection = catalogPlatformAgents.length > 0;

  async function toggleStatus(agent: AgentListItem) {
    if (agent.isPlatform) return;
    setToggling(agent._id);
    const newStatus = agent.status === 'active' ? 'disabled' : 'active';
    const res = await fetch(`/api/agents/${agent._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      queryClient.setQueryData(dashboardKeys.agents(), (prev: AgentListItem[] | undefined) =>
        (prev ?? []).map((a) => (a._id === agent._id ? { ...a, status: newStatus } : a)),
      );
      toast.success(newStatus === 'active' ? 'Agente activado' : 'Agente desactivado');
    } else {
      toast.error('No se pudo cambiar el estado del agente');
    }
    setToggling(null);
  }

  function requestDeleteAgent(agent: AgentListItem) {
    if (agent.isPlatform) return;
    setDeleteTarget(agent);
  }

  async function confirmDeleteAgent() {
    if (!deleteTarget) return;
    setDeleting(deleteTarget._id);
    try {
      const res = await fetch(`/api/agents/${deleteTarget._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'No se pudo eliminar el agente.');
        return;
      }
      queryClient.setQueryData(dashboardKeys.agents(), (prev: AgentListItem[] | undefined) =>
        (prev ?? []).filter((a) => a._id !== deleteTarget._id),
      );
      setDeleteTarget(null);
      toast.success('Agente eliminado.');
    } catch {
      toast.error('Error de red al eliminar el agente.');
    } finally {
      setDeleting(null);
    }
  }

  const deleteDescription = deleteTarget
    ? (deleteTarget.subAgentIds?.length ?? 0) > 0
      ? `Se eliminará «${deleteTarget.name}», sus ${deleteTarget.subAgentIds!.length} sub-agente(s) y los widgets vinculados. Esta acción no se puede deshacer.`
      : `Se eliminará «${deleteTarget.name}» y los widgets vinculados. Esta acción no se puede deshacer.`
    : '';

  const totalVisible = useMemo(() => {
    let n = 0;
    if (showMineSection) n += filteredMine.length;
    if (showPlatformSection) n += filteredPlatform.length;
    return n;
  }, [showMineSection, showPlatformSection, filteredMine.length, filteredPlatform.length]);

  const emptyGlobal = !loading && mineAgents.length === 0 && catalogPlatformAgents.length === 0;
  const emptyFilter = !loading && !emptyGlobal && totalVisible === 0;

  return (
    <DashboardShell wide>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar agente"
        description={deleteDescription}
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting !== null}
        onConfirm={() => void confirmDeleteAgent()}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />

      <DashboardPageHeader
        badge="Agentes"
        badgeIcon={Sparkles}
        titleIcon={Bot}
        title="Mis"
        titleAccent="agentes"
        description="Tus agentes y el catálogo global van separados: el cupo del plan solo aplica a los tuyos."
        actions={
          <>
          <BackgroundRefreshIndicator active={agentsQuery.isFetching && !loading} />
          {atLimit ? (
            <DashboardButtonLink
              href="/dashboard/settings#settings-billing"
              variant="secondary"
              title={`Límite alcanzado (${usedAgents}/${agentLimitLabel})`}
              className="px-5 py-2.5 text-sm"
            >
              <Plus size={16} strokeWidth={2.5} />
              Límite alcanzado — Ver planes
            </DashboardButtonLink>
          ) : (
            <DashboardButtonLink
              href="/dashboard/agents/new"
              variant="primary"
              data-tour="agents-new"
              className="px-5 py-2.5 text-sm"
            >
              <Plus size={16} strokeWidth={2.5} />
              Nuevo agente
            </DashboardButtonLink>
          )}
          </>
        }
      />

      <div className="dashboard-plan-usage">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="flex justify-between text-xs font-semibold mb-2">
              <span>Agentes usados</span>
              <span className={atLimit ? 'text-[var(--state-error)]' : 'text-[var(--muted-foreground)]'}>
                {usedAgents} / {agentLimitLabel}
              </span>
            </div>
            <div className="dashboard-plan-usage__bar">
              <div
                className={`dashboard-plan-usage__fill${atLimit ? ' dashboard-plan-usage__fill--limit' : ''}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="text-xs shrink-0 text-[var(--muted-foreground)]">
            Plan:{' '}
            <span className="font-bold capitalize text-[var(--foreground)]">{plan}</span>
          </div>
          {atLimit ? (
            <Link
              href="/dashboard"
              className="text-xs font-bold px-3 py-1.5 rounded-full no-underline transition-opacity hover:opacity-90 landing-link-accent border border-[rgba(var(--brand-primary-rgb),0.22)] bg-[linear-gradient(135deg,rgba(var(--brand-primary-rgb),0.12),rgba(var(--brand-cool-rgb),0.1))]"
            >
              Actualizar plan →
            </Link>
          ) : null}
        </div>
      </div>

      {fetchError ? (
        <div className="dashboard-callout flex flex-wrap items-center justify-between gap-3 border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)]">
          <p className="dashboard-callout__text m-0 text-[var(--state-error)]">{fetchError}</p>
          <DashboardButton variant="primary" className="text-xs px-3 py-1.5" onClick={() => void agentsQuery.refetch()}>
            Reintentar
          </DashboardButton>
        </div>
      ) : null}

      <aside className="dashboard-callout">
        <p className="dashboard-callout__text m-0">
          <Link href="/dashboard/mcp" className="font-semibold landing-link-accent no-underline">
            Catálogo MCP →
          </Link>{' '}
          Conecta herramientas externas a tus agentes.
        </p>
      </aside>

      {loading ? (
        <AiLoadingInline
          label="Cargando agentes…"
          hint="Sincronizando tu catálogo de IA"
          style={{ padding: '56px 0' }}
        />
      ) : emptyGlobal ? (
        <DashboardEmptyState
          icon={<Bot size={28} className="text-[var(--primary)]" strokeWidth={1.75} />}
          title="Aún no tienes agentes"
          description="Crea tu primer agente de IA para empezar a automatizar."
          action={
            <DashboardButtonLink href="/dashboard/agents/new" variant="primary" className="px-6 py-2.5">
              <Plus size={16} />
              Crear primer agente
            </DashboardButtonLink>
          }
        />
      ) : (
        <div data-tour="agents-list">
          <DashboardGridToolbar
            title={filter === 'platform' ? 'Catálogo plataforma' : 'Tus agentes'}
            count={totalVisible}
            countLabel={totalVisible === 1 ? 'agente' : 'agentes'}
            filter={
              <DashboardFilterMenu value={filter} options={AGENT_FILTER_OPTIONS} onChange={setFilter} />
            }
          />

          {emptyFilter ? (
            <DashboardEmptyState
              icon={<Bot size={28} className="text-[var(--primary)]" strokeWidth={1.75} />}
              title="Sin resultados"
              description="Ningún agente coincide con este filtro."
              action={
                <DashboardButton variant="secondary" onClick={() => setFilter('all')}>
                  Ver todos
                </DashboardButton>
              }
            />
          ) : (
            <div className="flex flex-col gap-10">
              {showMineSection && filteredMine.length > 0 ? (
                <section>
                  <div className="dashboard-resource-grid">
                    {filteredMine.map((agent) => (
                      <AgentListCard
                        key={agent._id}
                        agent={agent}
                        getModelLabel={getModelLabel}
                        toggling={toggling}
                        deleting={deleting}
                        onToggleStatus={toggleStatus}
                        onDelete={requestDeleteAgent}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {showMineSection && mineAgents.length === 0 && catalogPlatformAgents.length > 0 && filter === 'all' ? (
                <DashboardCallout>
                  Aún no tienes agentes propios. Más abajo tienes el catálogo global de la plataforma.
                </DashboardCallout>
              ) : null}

              {showPlatformSection && filteredPlatform.length > 0 ? (
                <section>
                  {filter !== 'platform' ? (
                    <>
                      <h2 className="dashboard-section-title dashboard-section-title--sub">
                        <Globe2 size={18} className="text-[var(--primary)]" />
                        Catálogo plataforma
                      </h2>
                      <p className="dashboard-section-desc">
                        Sincronizados desde el hub; la edición puede estar restringida.
                      </p>
                    </>
                  ) : null}
                  <div className="dashboard-resource-grid">
                    {filteredPlatform.map((agent) => (
                      <AgentListCard
                        key={agent._id}
                        agent={agent}
                        getModelLabel={getModelLabel}
                        toggling={toggling}
                        deleting={deleting}
                        onToggleStatus={toggleStatus}
                        onDelete={requestDeleteAgent}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
