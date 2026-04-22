'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSubscription } from '@/hooks/use-subscription';
import { useClientModels } from '@/hooks/use-client-models';
import { getAgentLimits, TOOL_MAP } from '@/lib/agent-plans';
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
} from 'lucide-react';

const R = '#e41414';
const B = '#00acf8';

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
}

function AgentCard({
  agent,
  getModelLabel,
  toggling,
  onToggleStatus,
}: {
  agent: ClientAgent;
  getModelLabel: (id: string) => string;
  toggling: string | null;
  onToggleStatus: (a: ClientAgent) => void;
}) {
  const ragN = Array.isArray(agent.ragSources) ? agent.ragSources.length : 0;
  const isDisabled = agent.status === 'disabled';
  const barColor = isDisabled ? '#94a3b8' : R;

  return (
    <div
      className="card-hover rounded-2xl overflow-hidden border"
      style={{
        borderColor: isDisabled ? 'var(--border)' : `rgba(228,20,20,0.18)`,
        background: 'var(--card)',
        opacity: isDisabled ? 0.72 : 1,
      }}
    >
      <div style={{ height: 3, background: `linear-gradient(90deg, ${barColor}, ${B}99)` }} />
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
                style={{ background: `${B}18`, color: B }}
              >
                Plataforma
              </span>
            )}
            {agent.syncStatus === 'synced' && (
              <span className="text-[10px] font-semibold" style={{ color: B }}>
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
              <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: B }}>
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
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          {!agent.isPlatform && (
            <button
              type="button"
              onClick={() => onToggleStatus(agent)}
              disabled={toggling === agent._id}
              title={isDisabled ? 'Activar agente' : 'Desactivar agente'}
              className="flex items-center justify-center w-9 h-9 rounded-lg border cursor-pointer transition-colors bg-transparent"
              style={{
                borderColor: 'var(--border)',
                color: isDisabled ? '#16a34a' : '#ef4444',
              }}
            >
              <CircleOff size={14} />
            </button>
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
  const [toggling, setToggling] = useState<string | null>(null);
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
    fetch('/api/agents')
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .finally(() => setLoading(false));
  }, []);

  const mainAgents = agents.filter((a) => a.type === 'agent');
  const mineAgents = useMemo(() => mainAgents.filter((a) => !a.isPlatform), [mainAgents]);
  const catalogPlatformAgents = useMemo(
    () => mainAgents.filter((a) => a.isPlatform === true),
    [mainAgents],
  );
  const usedAgents = mineAgents.length;
  const atLimit = usedAgents >= limits.agents;

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
    }
    setToggling(null);
  }

  const pct = Math.min(100, (usedAgents / limits.agents) * 100);

  return (
    <div className="relative overflow-hidden" style={{ minHeight: '100%' }}>
      <div className="hero-glow pointer-events-none" style={{ background: R, top: '-200px', right: '-60px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: B, top: '100px', left: '-120px' }} />

      <div className="relative px-6 py-10 max-w-4xl mx-auto">
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
          <Link
            href="/dashboard/agents/new"
            data-tour="agents-new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold no-underline transition-all shrink-0"
            style={
              atLimit
                ? {
                    background: 'var(--muted)',
                    color: 'var(--muted-foreground)',
                    pointerEvents: 'none',
                    opacity: 0.65,
                  }
                : {
                    background: `linear-gradient(135deg, ${R}, #f87600)`,
                    color: '#fff',
                    boxShadow: '0 4px 18px rgba(228,20,20,0.28)',
                  }
            }
          >
            <Plus size={16} strokeWidth={2.5} /> Nuevo agente
          </Link>
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
                  {usedAgents} / {limits.agents}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: atLimit ? '#ef4444' : `linear-gradient(90deg, ${R}, ${B})`,
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
                  background: 'linear-gradient(135deg, rgba(228,20,20,0.12), rgba(0,172,248,0.1))',
                  color: 'var(--primary)',
                  border: '1px solid rgba(228,20,20,0.22)',
                }}
              >
                Actualizar plan →
              </Link>
            )}
          </div>
        </div>

        {/* Lista: ancla `agents-list` siempre en el DOM (también en carga) para que el onboarding reanude al llegar desde /dashboard */}
        <div data-tour="agents-list">
        {loading ? (
          <div className="flex justify-center py-14 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Cargando agentes...
          </div>
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
                background: `linear-gradient(135deg, ${R}, #f87600)`,
                boxShadow: '0 4px 18px rgba(228,20,20,0.28)',
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
                  Estos cuentan para el límite de tu plan ({usedAgents} / {limits.agents}).
                </p>
                <div className="flex flex-col gap-4">
                  {mineAgents.map((agent) => (
                    <AgentCard
                      key={agent._id}
                      agent={agent}
                      getModelLabel={getModelLabel}
                      toggling={toggling}
                      onToggleStatus={toggleStatus}
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
                  <Globe2 size={18} style={{ color: B }} />
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
                      onToggleStatus={toggleStatus}
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
