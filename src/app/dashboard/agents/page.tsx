'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSubscription } from '@/hooks/use-subscription';
import { useClientModels } from '@/hooks/use-client-models';
import { getAgentLimits, TOOL_MAP } from '@/lib/agent-plans';
import { Bot, Plus, Zap, CircleOff, ChevronRight, Wrench, Network } from 'lucide-react';

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
  /** Presente en API; usamos longitud para el estado de RAG en lista. */
  ragSources?: unknown[];
  createdAt: string;
  /** Agente global de la plataforma (no cuenta en el cupo del usuario). */
  isPlatform?: boolean;
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
  const ownMainAgents = mainAgents.filter((a) => !a.isPlatform);
  const usedAgents = ownMainAgents.length;
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
      setAgents((prev) => prev.map((a) => a._id === agent._id ? { ...a, status: newStatus } : a));
    }
    setToggling(null);
  }

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={22} style={{ color: '#6366f1' }} />
            Mis Agentes
          </h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '13px' }}>
            Agentes de IA personalizados para tu negocio
          </p>
        </div>
        <Link
          href="/dashboard/agents/new"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '9px 18px', borderRadius: '10px', fontWeight: 700,
            fontSize: '13px', background: atLimit ? 'var(--muted)' : '#6366f1',
            color: atLimit ? 'var(--muted-foreground)' : '#fff',
            textDecoration: 'none',
            pointerEvents: atLimit ? 'none' : 'auto',
            opacity: atLimit ? 0.6 : 1,
          }}
        >
          <Plus size={14} /> Nuevo agente
        </Link>
      </div>

      {/* Plan usage bar */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '16px 20px', marginBottom: '24px',
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
            <span style={{ fontWeight: 600 }}>Agentes usados</span>
            <span style={{ color: atLimit ? '#ef4444' : 'var(--muted-foreground)' }}>
              {usedAgents} / {limits.agents}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (usedAgents / limits.agents) * 100)}%`,
              background: atLimit ? '#ef4444' : '#6366f1',
              borderRadius: 3,
              transition: 'width 0.4s',
            }} />
          </div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
          Plan: <span style={{ fontWeight: 700, textTransform: 'capitalize', color: 'var(--foreground)' }}>{plan}</span>
        </div>
        {atLimit && (
          <Link href="/dashboard" style={{
            fontSize: '12px', fontWeight: 700, color: '#6366f1', textDecoration: 'none',
            background: 'rgba(99,102,241,0.1)', padding: '4px 12px', borderRadius: '20px',
          }}>
            Actualizar plan →
          </Link>
        )}
      </div>

      {/* Agent list */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: 'var(--muted-foreground)' }}>
          Cargando agentes...
        </div>
      ) : mainAgents.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 24px',
          background: 'var(--card)', border: '1px dashed var(--border)', borderRadius: '14px',
        }}>
          <Bot size={40} style={{ color: 'var(--muted-foreground)', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 700, marginBottom: '6px' }}>Aún no tienes agentes</p>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '20px' }}>
            Crea tu primer agente de IA para empezar a automatizar.
          </p>
          <Link href="/dashboard/agents/new" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '9px 20px', borderRadius: '10px', fontWeight: 700,
            fontSize: '13px', background: '#6366f1', color: '#fff', textDecoration: 'none',
          }}>
            <Plus size={14} /> Crear primer agente
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {mainAgents.map((agent) => {
            const ragN = Array.isArray(agent.ragSources) ? agent.ragSources.length : 0;
            const subCount = agents.filter((a) => a.type === 'sub-agent' && a.subAgentIds?.includes?.(agent._id) || agent.subAgentIds?.includes?.(a._id)).length;
            const isDisabled = agent.status === 'disabled';
            return (
              <div key={agent._id} style={{
                background: 'var(--card)', border: `1px solid ${isDisabled ? 'var(--border)' : 'rgba(99,102,241,0.2)'}`,
                borderRadius: '14px', padding: '18px 20px',
                opacity: isDisabled ? 0.65 : 1,
                display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
              }}>
                {/* Icon */}
                <div style={{
                  width: 44, height: 44, borderRadius: '12px', flexShrink: 0,
                  background: isDisabled ? 'var(--border)' : 'rgba(99,102,241,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Bot size={20} style={{ color: isDisabled ? 'var(--muted-foreground)' : '#6366f1' }} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px' }}>{agent.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 20,
                      background: isDisabled ? 'rgba(107,114,128,0.15)' : 'rgba(34,197,94,0.12)',
                      color: isDisabled ? '#6b7280' : '#22c55e',
                    }}>
                      {isDisabled ? 'Desactivado' : 'Activo'}
                    </span>
                    {agent.isPlatform && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 20,
                        background: 'rgba(99,102,241,0.15)', color: '#6366f1',
                      }}>
                        Plataforma
                      </span>
                    )}
                    {agent.syncStatus === 'synced' && (
                      <span style={{ fontSize: 10, color: '#0d9488', fontWeight: 600 }}>✓ Hub sync</span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agent.description || getModelLabel(agent.model)}
                  </p>
                  {agent.description ? (
                    <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Modelo: {getModelLabel(agent.model)}
                    </p>
                  ) : null}
                  {/* Badges */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {agent.tools.length > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: 11, color: 'var(--muted-foreground)' }}>
                        <Wrench size={10} /> {agent.tools.map((t) => TOOL_MAP[t.toolId]?.name ?? t.toolId).join(', ')}
                      </span>
                    )}
                    {agent.subAgentIds?.length > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: 11, color: '#6366f1' }}>
                        <Network size={10} /> {agent.subAgentIds.length} sub-agente{agent.subAgentIds.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {agent.ragEnabled && ragN > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: 11, color: '#0d9488', fontWeight: 600 }}>
                        <Zap size={10} /> RAG cargado · {ragN} fuente{ragN !== 1 ? 's' : ''}
                      </span>
                    )}
                    {agent.ragEnabled && ragN === 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: 11, color: '#d97706' }}>
                        <Zap size={10} /> RAG activo · sin fuentes
                      </span>
                    )}
                    {!agent.ragEnabled && ragN > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: 11, color: 'var(--muted-foreground)' }} title="RAG desactivado; las fuentes siguen guardadas">
                        <Zap size={10} /> RAG off · {ragN} fuente{ragN !== 1 ? 's' : ''} guardada{ragN !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Acciones: los agentes de plataforma no tienen enlace (no se configuran desde la landing). */}
                {!agent.isPlatform && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => toggleStatus(agent)}
                      disabled={toggling === agent._id}
                      title={isDisabled ? 'Activar agente' : 'Desactivar agente'}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 32, height: 32, borderRadius: '8px', border: '1px solid var(--border)',
                        background: 'transparent', cursor: 'pointer',
                        color: isDisabled ? '#22c55e' : '#ef4444',
                      }}
                    >
                      <CircleOff size={14} />
                    </button>
                    <Link
                      href={`/dashboard/agents/${agent._id}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '6px 12px', borderRadius: '8px', textDecoration: 'none',
                        fontSize: '12px', fontWeight: 600,
                        background: 'rgba(99,102,241,0.08)', color: '#6366f1',
                      }}
                    >
                      Configurar <ChevronRight size={12} />
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
