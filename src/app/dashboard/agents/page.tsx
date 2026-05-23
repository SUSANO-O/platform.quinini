'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useSubscription } from '@/hooks/use-subscription';
import { useClientModels } from '@/hooks/use-client-models';
import { getAgentLimits, isAgentLimitReached, TOOL_MAP } from '@/lib/agent-plans';
import { SKILL_MAP } from '@/lib/agent-skills';
import {
  Bot,
  Plus,
  Zap,
  CircleOff,
  ChevronRight,
  Wrench,
  Network,
  Sparkles,
  Globe2,
  Trash2,
} from 'lucide-react';

import { UI_SURFACE_SECONDARY } from '@/lib/brand';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const R = 'var(--primary)';

interface ClientAgent {
  _id: string;
  name: string;
  description: string;
  model: string;
  type: 'agent' | 'sub-agent';
  status: 'active' | 'disabled';
  tools: { toolId: string }[];
  subAgentIds: string[];
  syncStatus: string;
  ragEnabled: boolean;
  ragSources?: unknown[];
  createdAt: string;
  isPlatform?: boolean;
  skills?: string[];
}

function AgentCard({
  agent,
  getModelLabel,
  toggling,
  deleting,
  onToggleStatus,
  onDelete,
}: {
  agent: ClientAgent;
  getModelLabel: (id: string) => string;
  toggling: string | null;
  deleting: string | null;
  onToggleStatus: (a: ClientAgent) => void;
  onDelete: (a: ClientAgent) => void;
}) {
  const ragN = Array.isArray(agent.ragSources) ? agent.ragSources.length : 0;
  const isDisabled = agent.status === 'disabled';
  const barColor = isDisabled ? '#94a3b8' : R;

  return (
    <div
      className="card-hover rounded-2xl overflow-hidden border"
      style={{
        borderColor: isDisabled ? 'var(--border)' : `rgba(var(--brand-primary-rgb),0.18)`,
        background: 'var(--card)',
        opacity: isDisabled ? 0.72 : 1,
      }}
    >
      <div style={{ height: 3, background: barColor }} />
      <div className="flex flex-wrap items-center gap-4 p-4 md:p-5">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: isDisabled ? 'var(--muted)' : `${R}12`,
            border: `1px solid ${isDisabled ? 'var(--border)' : `${R}28`}`,
          }}
        >
          <Bot size={20} style={{ color: isDisabled ? 'var(--muted-foreground)' : R }} strokeWidth={1.75} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-bold text-sm">{agent.name}</span>
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{
                background: isDisabled ? 'rgba(107,114,128,0.12)' : 'rgba(34,197,94,0.12)',
                color: isDisabled ? '#6b7280' : '#16a34a',
              }}
            >
              {isDisabled ? 'Desactivado' : 'Activo'}
            </span>
            {agent.isPlatform && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={UI_SURFACE_SECONDARY}
              >
                Plataforma
              </span>
            )}
            {agent.syncStatus === 'synced' && (
              <span className="text-[10px] font-semibold" style={{ color: 'var(--muted-foreground)' }}>
                ✓ Hub sync
              </span>
            )}
          </div>
          <p className="text-xs m-0 truncate" style={{ color: 'var(--muted-foreground)' }}>
            {agent.description || getModelLabel(agent.model)}
          </p>
          {agent.description ? (
            <p className="text-[11px] m-0 mt-1 truncate" style={{ color: 'var(--muted-foreground)' }}>
              Modelo: {getModelLabel(agent.model)}
            </p>
          ) : null}
          <div className="flex gap-3 mt-2 flex-wrap">
            {agent.tools.length > 0 && (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                <Wrench size={10} /> {agent.tools.map((t) => TOOL_MAP[t.toolId]?.name ?? t.toolId).join(', ')}
              </span>
            )}
            {agent.subAgentIds?.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: R }}>
                <Network size={10} /> {agent.subAgentIds.length} sub-agente{agent.subAgentIds.length !== 1 ? 's' : ''}
              </span>
            )}
            {agent.ragEnabled && ragN > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: R }}>
                <Zap size={10} /> RAG cargado · {ragN} fuente{ragN !== 1 ? 's' : ''}
              </span>
            )}
            {agent.ragEnabled && ragN === 0 && (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: '#d97706' }}>
                <Zap size={10} /> RAG activo · sin fuentes
              </span>
            )}
            {!agent.ragEnabled && ragN > 0 && (
              <span
                className="flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--muted-foreground)' }}
                title="RAG desactivado; las fuentes siguen guardadas"
              >
                <Zap size={10} /> RAG off · {ragN} guardada{ragN !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {agent.skills && agent.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {agent.skills.slice(0, 5).map((sid) => {
                const sk = SKILL_MAP.get(sid);
                if (!sk) return null;
                return (
                  <span
                    key={sid}
                    title={sk.description}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 20,
                      background: `${sk.color}22`,
                      color: sk.color,
                      border: `1px solid ${sk.color}44`,
                    }}
                  >
                    {sk.label}
                  </span>
                );
              })}
              {agent.skills.length > 5 && (
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)', padding: '2px 4px' }}>
                  +{agent.skills.length - 5} más
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          {!agent.isPlatform && (
            <>
              <button
                type="button"
                onClick={() => onToggleStatus(agent)}
                disabled={toggling === agent._id || deleting === agent._id}
                title={isDisabled ? 'Activar agente' : 'Desactivar agente'}
                className="flex items-center justify-center w-9 h-9 rounded-lg border cursor-pointer transition-colors bg-transparent"
                style={{
                  borderColor: 'var(--border)',
                  color: isDisabled ? '#16a34a' : '#ef4444',
                }}
              >
                <CircleOff size={14} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(agent)}
                disabled={toggling === agent._id || deleting === agent._id}
                title="Eliminar agente"
                className="flex items-center justify-center w-9 h-9 rounded-lg border cursor-pointer transition-colors bg-transparent"
                style={{
                  borderColor: 'rgba(239,68,68,0.35)',
                  color: '#ef4444',
                  opacity: deleting === agent._id ? 0.5 : 1,
                }}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
          <Link
            href={`/dashboard/agents/${agent._id}`}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold no-underline transition-opacity hover:opacity-90"
            style={{
              background: `${R}10`,
              color: R,
              border: `1px solid ${R}28`,
            }}
          >
            {agent.isPlatform ? 'Ver' : 'Configurar'} <ChevronRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const { subscription } = useSubscription();
  const plan = subscription?.plan ?? 'free';
  const limits = getAgentLimits(plan);

  const [agents, setAgents] = useState<ClientAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientAgent | null>(null);
  const { models: clientModels } = useClientModels(plan);

  const modelLabelById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of clientModels) {
      m[c.id] = c.name;
    }
    return m;
  }, [clientModels]);

  const getModelLabel = (modelId: string) => modelLabelById[modelId] ?? modelId;

  useEffect(() => {
    setFetchError(null);
    fetch('/api/agents')
      .then(async (r) => {
        if (!r.ok) throw new Error('No se pudieron cargar los agentes.');
        return r.json();
      })
      .then((d) => setAgents(d.agents ?? []))
      .catch((e) => setFetchError(e instanceof Error ? e.message : 'Error de red'))
      .finally(() => setLoading(false));
  }, []);

  const mainAgents = agents.filter((a) => a.type === 'agent');
  const mineAgents = useMemo(() => mainAgents.filter((a) => !a.isPlatform), [mainAgents]);
  const catalogPlatformAgents = useMemo(
    () => mainAgents.filter((a) => a.isPlatform === true),
    [mainAgents],
  );
  const usedAgents = mineAgents.length;
  const unlimitedAgents = limits.agents < 0;
  const atLimit = isAgentLimitReached(usedAgents, limits.agents);

  async function toggleStatus(agent: ClientAgent) {
    if (agent.isPlatform) return;
    setToggling(agent._id);
    const newStatus = agent.status === 'active' ? 'disabled' : 'active';
    const res = await fetch(`/api/agents/${agent._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setAgents((prev) => prev.map((a) => (a._id === agent._id ? { ...a, status: newStatus } : a)));
      toast.success(newStatus === 'active' ? 'Agente activado' : 'Agente desactivado');
    } else {
      toast.error('No se pudo cambiar el estado del agente');
    }
    setToggling(null);
  }

  function requestDeleteAgent(agent: ClientAgent) {
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
      setAgents((prev) => prev.filter((a) => a._id !== deleteTarget._id));
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

  const pct = unlimitedAgents ? 0 : Math.min(100, (usedAgents / limits.agents) * 100);
  const agentLimitLabel = unlimitedAgents ? 'Ilimitados' : String(limits.agents);

  return (
    <div className="relative overflow-hidden" style={{ minHeight: '100%' }}>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar agente"
        description={deleteDescription}
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting !== null}
        onConfirm={() => void confirmDeleteAgent()}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />
      <div className="hero-glow pointer-events-none" style={{ background: R, top: '-200px', right: '-60px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: R, top: '-200px', right: '-60px' }} />

      <div className="relative px-4 py-4 max-w-4xl mx-auto">
        {/* Cabecera */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <div className="badge-primary mb-3 w-fit">
              <Sparkles size={13} />
              Agentes
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight m-0 flex items-center gap-2 flex-wrap">
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${R}14`, border: `1px solid ${R}30` }}
              >
                <Bot size={22} style={{ color: R }} strokeWidth={1.75} />
              </span>
              <span>
                Mis <span className="gradient-text">agentes</span>
              </span>
            </h1>
            <p className="text-sm mt-2 m-0" style={{ color: 'var(--muted-foreground)' }}>
              Tus agentes y el catálogo global van separados: el cupo del plan solo aplica a los tuyos.
            </p>
          </div>
          {atLimit ? (
            <Link
              href="/dashboard/settings#settings-billing"
              title={`Límite alcanzado (${usedAgents}/${agentLimitLabel})`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold no-underline transition-all shrink-0"
              style={{
                background: 'rgba(var(--brand-primary-rgb),0.1)',
                color: R,
                border: `1px solid ${R}35`,
              }}
            >
              <Plus size={16} strokeWidth={2.5} /> Límite alcanzado — Ver planes
            </Link>
          ) : (
          <Link
            href="/dashboard/agents/new"
            data-tour="agents-new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold no-underline transition-all shrink-0"
            style={{
              background: R,
              color: '#fff',
              boxShadow: '0 4px 18px rgba(var(--brand-primary-rgb),0.28)',
            }}
          >
            <Plus size={16} strokeWidth={2.5} /> Nuevo agente
          </Link>
          )}
        </div>

        {/* Uso del plan */}
        <div
          className="card-texture rounded-2xl border p-5 mb-8"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex justify-between text-xs font-semibold mb-2">
                <span>Agentes usados</span>
                <span style={{ color: atLimit ? '#ef4444' : 'var(--muted-foreground)' }}>
                  {usedAgents} / {agentLimitLabel}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: atLimit ? '#ef4444' : R,
                  }}
                />
              </div>
            </div>
            <div className="text-xs shrink-0" style={{ color: 'var(--muted-foreground)' }}>
              Plan:{' '}
              <span className="font-bold capitalize" style={{ color: 'var(--foreground)' }}>
                {plan}
              </span>
            </div>
            {atLimit && (
              <Link
                href="/dashboard"
                className="text-xs font-bold px-3 py-1.5 rounded-full no-underline transition-opacity hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, rgba(var(--brand-primary-rgb),0.12), rgba(var(--brand-cool-rgb),0.1))',
                  color: 'var(--primary)',
                  border: '1px solid rgba(var(--brand-primary-rgb),0.22)',
                }}
              >
                Actualizar plan →
              </Link>
            )}
          </div>
        </div>

        {fetchError && (
          <div
            className="rounded-xl border p-4 mb-6 flex flex-wrap items-center justify-between gap-3"
            style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}
          >
            <p className="text-sm m-0" style={{ color: '#ef4444' }}>{fetchError}</p>
            <button
              type="button"
              onClick={() => { setLoading(true); setFetchError(null); fetch('/api/agents').then(async (r) => { if (!r.ok) throw new Error(); return r.json(); }).then((d) => setAgents(d.agents ?? [])).catch(() => setFetchError('No se pudieron cargar los agentes.')).finally(() => setLoading(false)); }}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border-0 cursor-pointer"
              style={{ background: R, color: '#fff' }}
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-3 text-xs">
          <Link href="/dashboard/mcp" className="font-semibold landing-link-accent no-underline">
            Catálogo MCP →
          </Link>
        </div>

        {/* Lista: ancla `agents-list` siempre en el DOM (también en carga) para que el onboarding reanude al llegar desde /dashboard */}
        <div data-tour="agents-list">
        {loading ? (
          <AiLoadingInline label="Cargando agentes…" hint="Sincronizando tu catálogo de IA" style={{ padding: '56px 0' }} />
        ) : mineAgents.length === 0 && catalogPlatformAgents.length === 0 ? (
          <div
            className="card-texture rounded-2xl border border-dashed text-center py-14 px-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: `${R}12`, border: `1px solid ${R}28` }}
            >
              <Bot size={28} style={{ color: R }} strokeWidth={1.5} />
            </div>
            <p className="font-bold text-base mb-1 m-0">Aún no tienes agentes</p>
            <p className="text-sm mb-6 m-0 max-w-sm mx-auto" style={{ color: 'var(--muted-foreground)' }}>
              Crea tu primer agente de IA para empezar a automatizar.
            </p>
            <Link
              href="/dashboard/agents/new"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white no-underline transition-transform hover:scale-[1.02]"
              style={{
                background: R,
                boxShadow: '0 4px 18px rgba(var(--brand-primary-rgb),0.28)',
              }}
            >
              <Plus size={16} /> Crear primer agente
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {mineAgents.length > 0 && (
              <section>
                <h2 className="text-base font-bold m-0 mb-1 tracking-tight">Tus agentes</h2>
                <p className="text-xs m-0 mb-4" style={{ color: 'var(--muted-foreground)' }}>
                  Estos cuentan para el límite de tu plan ({usedAgents} / {agentLimitLabel}).
                </p>
                <div className="flex flex-col gap-4">
                  {mineAgents.map((agent) => (
                    <AgentCard
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
            )}

            {mineAgents.length === 0 && catalogPlatformAgents.length > 0 && (
              <div
                className="rounded-2xl border border-dashed p-4 mb-2 text-center text-sm"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
              >
                Aún no tienes agentes propios. Más abajo tienes el catálogo global de la plataforma.
              </div>
            )}

            {catalogPlatformAgents.length > 0 && (
              <section>
                <h2 className="text-base font-bold m-0 mb-1 tracking-tight flex items-center gap-2 flex-wrap">
                  <Globe2 size={18} style={{ color: R }} />
                  Catálogo plataforma
                </h2>
                <p className="text-xs m-0 mb-4" style={{ color: 'var(--muted-foreground)' }}>
                  Agentes globales sincronizados desde el hub. No consumen tu cupo de cantidad de agentes,
                  pero su uso sí puede consumir cuota de conversaciones (tras el tramo gratis mensual de
                  plataforma). Su edición puede estar restringida si son de solo lectura.
                </p>
                <div className="flex flex-col gap-4">
                  {catalogPlatformAgents.map((agent) => (
                    <AgentCard
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
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
