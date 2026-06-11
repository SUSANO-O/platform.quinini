'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertCircle,
  Bot,
  Cpu,
  Wrench,
  CheckCircle2,
  XCircle,
  Clock,
  Palette,
  Globe,
  Shield,
  RefreshCw,
  Network,
  MessageSquare,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';

interface WidgetShortcut {
  id: string;
  label: string;
  message: string;
  emoji?: string;
  enabled: boolean;
}

interface WidgetDoc {
  _id: string;
  name: string;
  agentId: string;
  color: string;
  title?: string;
  subtitle?: string;
  welcome?: string;
  fabHint?: string;
  humanSupportPhone?: string;
  humanSupportEnabled?: boolean;
  handoffEnabled?: boolean;
  handoffNotifyMode?: string;
  avatar?: string;
  position: string;
  theme: string;
  borderRadius?: string;
  autoOpen?: boolean;
  afhubToken?: string | null;
  shortcuts?: WidgetShortcut[];
  multiAgentEnabled?: boolean;
  multiAgentMode?: 'triage' | 'pipeline' | 'parallel';
  orchestratorAgentIds?: string[];
  agentIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface AgentDoc {
  _id: string;
  name: string;
  description?: string;
  model?: string;
  inferenceTemperature?: number;
  inferenceMaxTokens?: number;
  status?: string;
  syncStatus?: string;
  agentHubId?: string;
  isPlatform?: boolean;
  tools?: { toolId: string; config?: unknown }[];
  enabledMcpToolIds?: string[];
  ragEnabled?: boolean;
  ragSources?: { type: string; name: string }[];
  type?: string;
  subAgentIds?: string[];
  skills?: string[];
  strictPurposeOnly?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

type SubAgentSummary = {
  _id: string;
  name: string;
  model?: string;
  status?: string;
  description?: string;
  toolsCount?: number;
  syncStatus?: string;
  ragEnabled?: boolean;
};

interface McpServerGroup {
  integrationKey: string;
  serverName: string;
  description: string;
  syncStatus: 'ok' | 'pending' | 'error';
  connectionId: string;
  tools: { id: string; name: string; description: string }[];
}

function parseBorderRadius(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.min(32, Math.max(0, v));
  const s = String(v ?? '');
  const n = parseInt(s.replace(/px/gi, '').trim(), 10);
  return Number.isFinite(n) ? Math.min(32, Math.max(0, n)) : 16;
}

/** Misma clave que usa la ficha `/dashboard/agents/[id]` para MCP (ObjectId landing 24 hex). */
function mcpAgentToolsQueryId(widgetAgentId: string, agentDoc: AgentDoc | null): string {
  const w = widgetAgentId.trim();
  const id = agentDoc?._id;
  if (typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id)) return id;
  return w;
}

function formatDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mapSubAgentFromApi(s: Record<string, unknown>): SubAgentSummary {
  return {
    _id: String(s._id),
    name: String(s.name || 'Sub-agente'),
    model: typeof s.model === 'string' ? s.model : undefined,
    status: typeof s.status === 'string' ? s.status : undefined,
    description: typeof s.description === 'string' ? s.description : undefined,
    toolsCount: Array.isArray(s.tools) ? s.tools.length : undefined,
    syncStatus: typeof s.syncStatus === 'string' ? s.syncStatus : undefined,
    ragEnabled: s.ragEnabled === true,
  };
}

async function fetchAgentSummaries(ids: string[]): Promise<SubAgentSummary[]> {
  const unique = [...new Set(ids.filter((id) => /^[a-f0-9]{24}$/i.test(id)))];
  if (unique.length === 0) return [];
  const results = await Promise.all(
    unique.map(async (id) => {
      try {
        const r = await fetch(`/api/agents/${encodeURIComponent(id)}`);
        if (!r.ok) return { _id: id, name: id };
        const d = await r.json().catch(() => ({}));
        const a = (d?.agent ?? d?.data) as Record<string, unknown> | null;
        if (!a) return { _id: id, name: id };
        return mapSubAgentFromApi(a);
      } catch {
        return { _id: id, name: id };
      }
    }),
  );
  return results;
}

const syncBadge = (status?: string) => {
  if (status === 'ok' || status === 'synced') return <span style={{ color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><CheckCircle2 size={13} /> Sincronizado</span>;
  if (status === 'error' || status === 'failed') return <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><XCircle size={13} /> Error</span>;
  return <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><Clock size={13} /> Pendiente</span>;
};

/** Carga widget.js con cache por minuto (evita re-descarga en cada vista previa). */
function loadWidgetScript(origin: string): Promise<void> {
  try {
    document.querySelectorAll('script[data-afhub-widget-preview]').forEach((n) => n.remove());
  } catch { /* ignore */ }
  try { delete (window as unknown as Record<string, unknown>).AgentFlowhub; } catch { /* ignore */ }

  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${origin}/widget.js?v=${Math.floor(Date.now() / 60000)}`; // cache 1 min
    s.async = true;
    s.setAttribute('data-afhub-widget-preview', '1');
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar widget.js'));
    document.body.appendChild(s);
  });
}

export default function WidgetPreviewPage() {
  const [widget, setWidget] = useState<WidgetDoc | null>(null);
  const [agent, setAgent] = useState<AgentDoc | null>(null);
  const [subAgents, setSubAgents] = useState<SubAgentSummary[]>([]);
  const [teamSpecialists, setTeamSpecialists] = useState<SubAgentSummary[]>([]);
  const [extraOrchestrators, setExtraOrchestrators] = useState<SubAgentSummary[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hubRetryLoading, setHubRetryLoading] = useState(false);
  const [hubRetryHint, setHubRetryHint] = useState('');
  const instanceRef = useRef<{ destroy?: () => void } | null>(null);
  /** Empieza a cargar widget.js en cuanto el componente monta, en paralelo con los fetch de datos. */
  const scriptPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const rawId = params.get('id') ?? params.get('widgetId');
    const valid = rawId && /^[a-f0-9]{24}$/i.test(rawId) ? rawId : null;

    if (!valid) {
      setError('Falta un id de widget válido en la URL (?id=…).');
      setLoading(false);
      return;
    }

    const origin = window.location.origin;
    let cancelled = false;

    // Arranca la carga del script EN PARALELO con el fetch de datos (no secuencial)
    scriptPromiseRef.current = loadWidgetScript(origin);

    (async () => {
      try {
        // Script + datos del widget en paralelo
        const [, wData] = await Promise.all([
          scriptPromiseRef.current,
          fetch(`/api/widgets/${valid}`).then((r) => r.json()),
        ]);
        if (cancelled) return;

        if (!wData.widget) {
          setError(wData.error || 'Widget no encontrado.');
          setLoading(false);
          return;
        }

        const w = wData.widget as WidgetDoc;
        setWidget(w);
        setLoading(false);

        // Init del widget inmediatamente — script ya está listo gracias al Promise.all
        if (w.agentId?.trim() && !cancelled && window.AgentFlowhub) {
          try { instanceRef.current?.destroy?.(); } catch { /* ignore */ }
          const token = typeof w.afhubToken === 'string' && w.afhubToken.startsWith('wt_') ? w.afhubToken : '';
          const cfg: Record<string, unknown> = {
            agentId:   w.agentId,
            widgetId:  w._id,
            host:      origin,
            color:     w.color || '#0d9488',
            title:     w.title || 'Asistente',
            subtitle:  w.subtitle || '',
            welcome:   w.welcome || '',
            fabHint:   w.fabHint || '',
            humanSupportPhone: typeof w.humanSupportPhone === 'string' ? w.humanSupportPhone : '',
            humanSupportEnabled: w.humanSupportEnabled !== false,
            handoffEnabled: w.handoffEnabled !== false,
            avatar:    w.avatar || '',
            fabAvatarSize:
              typeof (w as { fabAvatarSize?: number }).fabAvatarSize === 'number'
                ? (w as { fabAvatarSize?: number }).fabAvatarSize
                : 86,
            position:  w.position || 'bottom-right',
            theme:     w.theme === 'dark' ? 'dark' : 'light',
            borderRadius: parseBorderRadius(w.borderRadius),
            autoOpen:  true,
            showMcpUi: true,
            // Shortcuts directamente del doc — sin fetch extra a /api/widget/config
            shortcuts: Array.isArray(w.shortcuts)
              ? w.shortcuts.filter((s) => s.enabled !== false)
              : [],
            ...(token ? { token } : {}),
          };
          const api = window.AgentFlowhub.init(cfg);
          instanceRef.current = api && typeof api === 'object' ? api : null;
        }

        // Agente + MCP en background (no bloquean el widget)
        if (w.agentId?.trim()) {
          const [agentRes, mcpRes] = await Promise.all([
            fetch(`/api/agents/${w.agentId}`).catch(() => null),
            fetch(`/api/mcp/agent-tools?agentId=${encodeURIComponent(w.agentId)}`).catch(() => null),
          ]);
          if (!cancelled && agentRes?.ok) {
            const aData = await agentRes.json().catch(() => ({}));
            const ag = aData?.agent ?? aData?.data ?? null;
            if (ag) setAgent(ag as AgentDoc);
            const subs = Array.isArray(aData?.subAgents) ? aData.subAgents : [];
            if (subs.length > 0) {
              setSubAgents(subs.map((s: Record<string, unknown>) => mapSubAgentFromApi(s)));
            }
            const specialistIds = Array.isArray(w.agentIds) ? w.agentIds : [];
            const orchExtraIds = Array.isArray(w.orchestratorAgentIds) ? w.orchestratorAgentIds : [];
            if (w.multiAgentEnabled && (specialistIds.length > 0 || orchExtraIds.length > 0)) {
              const [specs, orchs] = await Promise.all([
                fetchAgentSummaries(specialistIds),
                fetchAgentSummaries(orchExtraIds),
              ]);
              if (!cancelled) {
                setTeamSpecialists(specs);
                setExtraOrchestrators(orchs);
              }
            }
          }
          if (!cancelled && mcpRes?.ok) {
            const mData = await mcpRes.json().catch(() => ({}));
            setMcpServers(mData?.servers ?? []);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'No se pudo cargar el widget.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try { instanceRef.current?.destroy?.(); } catch { /* ignore */ }
      instanceRef.current = null;
    };
  }, []);

  const retryCatalogHubSync = useCallback(async () => {
    if (!agent?._id || agent.isPlatform) return;
    setHubRetryLoading(true);
    setHubRetryHint('');
    try {
      const r = await fetch(`/api/agents/${agent._id}/retry-hub-sync`, { method: 'POST' });
      const data = (await r.json().catch(() => ({}))) as {
        hubSync?: boolean;
        error?: string;
      };
      if (!r.ok) {
        setHubRetryHint(
          typeof data.error === 'string' && data.error.trim()
            ? data.error
            : `No se pudo sincronizar (${r.status}).`,
        );
        return;
      }
      if (data.hubSync === false) {
        setHubRetryHint(
          typeof data.error === 'string' && data.error.trim()
            ? data.error
            : 'El hub no aceptó la sincronización.',
        );
      } else {
        setHubRetryHint('');
      }
      const aid = widget?.agentId?.trim();
      if (aid) {
        const agentRes = await fetch(`/api/agents/${encodeURIComponent(aid)}`);
        if (agentRes.ok) {
          const aData = await agentRes.json().catch(() => ({}));
          const ag = (aData?.agent ?? aData?.data ?? null) as AgentDoc | null;
          if (ag) {
            setAgent(ag);
            const subs = Array.isArray(aData?.subAgents) ? aData.subAgents : [];
            setSubAgents(subs.map((s: Record<string, unknown>) => mapSubAgentFromApi(s)));
            const mcpKey = mcpAgentToolsQueryId(aid, ag);
            const mcpRes = await fetch(`/api/mcp/agent-tools?agentId=${encodeURIComponent(mcpKey)}`);
            if (mcpRes.ok) {
              const mData = await mcpRes.json().catch(() => ({}));
              setMcpServers(mData?.servers ?? []);
            }
          }
        }
      }
    } catch {
      setHubRetryHint('Error de red al contactar el servidor.');
    } finally {
      setHubRetryLoading(false);
    }
  }, [agent, widget?.agentId]);


  const totalMcpTools = mcpServers.reduce((s, g) => s + g.tools.length, 0);
  const syncedServers = mcpServers.filter((s) => s.syncStatus === 'ok');
  const builtInTools = agent?.tools?.filter((t) => !t.toolId.startsWith('mcp:') && !t.toolId.startsWith('std:')) ?? [];
  const subAgentCount = subAgents.length || agent?.subAgentIds?.length || 0;
  const isMultiAgentWidget = widget?.multiAgentEnabled === true || subAgentCount > 0;
  const enabledShortcuts = widget?.shortcuts?.filter((s) => s.enabled !== false) ?? [];
  const agentRoleLabel = widget && agent ? resolveAgentRoleLabel(agent, widget) : 'Agente';

  return (
    <div style={{ padding: '28px', maxWidth: 820 }}>
      <style>{`@keyframes afhub-spin{to{transform:rotate(360deg)}}`}</style>
      <Link
        href="/dashboard/widgets"
        style={{
          fontSize: 13, color: '#0d9488', fontWeight: 600,
          textDecoration: 'none', display: 'inline-flex',
          alignItems: 'center', gap: 6, marginBottom: 12,
        }}
      >
        <ArrowLeft size={14} /> Volver a Mis widgets
      </Link>

      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
        Vista previa del widget
      </h1>
      <p style={{ color: 'var(--muted-foreground)', fontSize: 13, marginBottom: widget ? 10 : 20 }}>
        {widget
          ? `Probando «${widget.name}». Usa el botón flotante para chatear.`
          : loading
            ? 'Preparando la vista previa de tu widget.'
            : 'Abre esta vista desde Mis widgets con el botón Preview.'}
      </p>

      {!loading && widget && agent && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <TypeBadge
            label={agentRoleLabel}
            tone={isMultiAgentWidget ? 'multi' : 'single'}
          />
          {agent.isPlatform && <TypeBadge label="Plataforma" tone="platform" />}
          {agent.status === 'active' ? (
            <TypeBadge label="Activo" tone="ok" />
          ) : (
            <TypeBadge label={agent.status || 'Inactivo'} tone="warn" />
          )}
          <TypeBadge label={`${totalMcpTools} MCP`} tone="neutral" />
          {(agent.tools?.length ?? 0) > 0 && (
            <TypeBadge label={`${agent.tools!.length} herramientas`} tone="neutral" />
          )}
          {agent.ragEnabled && (
            <TypeBadge label={`RAG · ${agent.ragSources?.length ?? 0}`} tone="neutral" />
          )}
        </div>
      )}

      {loading && (
        <div className="relative overflow-hidden" style={{ minHeight: '60vh' }}>
          <div className="hero-glow pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), transparent)', top: '-200px', right: '-60px' }} />
          <div className="hero-glow pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), transparent)', top: '100px', left: '-120px' }} />
          <div className="relative max-w-3xl mx-auto">
            <AiLoadingInline
              label="Cargando configuración…"
              hint="Agente, herramientas y chat embebido"
              style={{ padding: '64px 16px' }}
            />
          </div>
        </div>
      )}

      {!loading && error && !widget && (
        <p style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <AlertCircle size={18} /> {error}
        </p>
      )}

      {!loading && widget && error && (
        <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      {!loading && widget && !widget.agentId?.trim() && (
        <p style={{ color: '#f59e0b', fontSize: 13 }}>
          Este widget no tiene agente asignado. Edítalo en el Widget Builder y elige un agente sincronizado con el hub.
        </p>
      )}

      {/* ── Info Panel ──────────────────────────────────────────────── */}
      {!loading && widget && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 16,
            marginBottom: 20,
          }}
        >
          {/* Widget Card */}
          <InfoCard
            title="Widget"
            icon={<Palette size={15} />}
            headerActions={
              <Link
                href={`/dashboard/widget-builder?edit=${widget._id}`}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--primary)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  padding: '5px 11px',
                  borderRadius: 8,
                  border: '1px solid color-mix(in oklab, var(--primary) 38%, transparent)',
                  background: 'color-mix(in oklab, var(--primary) 10%, transparent)',
                }}
              >
                Editar widget →
              </Link>
            }
          >
            <Row label="Nombre" value={widget.name} />
            <Row label="ID" value={widget._id} mono />
            <Row label="Tema" value={widget.theme} />
            <Row label="Posición" value={widget.position} />
            <Row label="Color" value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: widget.color, display: 'inline-block', border: '1px solid rgba(0,0,0,.12)' }} />
                {widget.color}
              </span>
            } />
            <Row label="Auto-open" value={widget.autoOpen ? 'Sí' : 'No'} />
            <Row
              label="WhatsApp humano"
              value={
                widget.humanSupportEnabled === false
                  ? 'Desactivado'
                  : widget.humanSupportPhone?.trim()
                    ? widget.humanSupportPhone.trim()
                    : '—'
              }
            />
            <Row
              label="Escalación humana"
              value={
                widget.handoffEnabled === false
                  ? 'Desactivada'
                  : widget.handoffNotifyMode ?? 'both'
              }
            />
            <Row label="Token" value={widget.afhubToken ? <span style={{ color: '#22c55e', fontSize: 11 }}><Shield size={11} /> Asignado</span> : <span style={{ color: '#f59e0b', fontSize: 11 }}>Sin token</span>} />
            {isMultiAgentWidget && (
              <Row
                label="Multi-agente"
                value={
                  widget.multiAgentEnabled
                    ? <span style={{ color: '#6366f1', fontWeight: 700 }}>Avanzado · {formatMultiAgentMode(widget.multiAgentMode)}</span>
                    : <span style={{ color: '#22c55e', fontWeight: 700 }}>Triaje automático</span>
                }
              />
            )}
            <Row label="Creado" value={formatDate(widget.createdAt)} />
            <Row label="Actualizado" value={formatDate(widget.updatedAt)} />
          </InfoCard>

          {/* Chat UX */}
          <InfoCard title="Chat y atajos" icon={<MessageSquare size={15} />}>
            <Row label="Título" value={widget.title?.trim() || 'Asistente'} />
            <Row label="Subtítulo" value={widget.subtitle?.trim() || '—'} />
            <Row
              label="Bienvenida"
              value={
                widget.welcome?.trim() ? (
                  <span style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'normal', textAlign: 'right', maxWidth: 220, display: 'inline-block' }}>
                    {widget.welcome.trim().slice(0, 140)}
                    {widget.welcome.trim().length > 140 ? '…' : ''}
                  </span>
                ) : '—'
              }
            />
            <Row label="Hint FAB" value={widget.fabHint?.trim() || '—'} />
            <Row label="Atajos" value={`${enabledShortcuts.length} activo${enabledShortcuts.length !== 1 ? 's' : ''}`} />
            {enabledShortcuts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {enabledShortcuts.slice(0, 5).map((sc) => (
                  <span
                    key={sc.id}
                    style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 8,
                      background: 'color-mix(in oklab, var(--foreground) 5%, transparent)',
                      border: '1px solid color-mix(in oklab, var(--foreground) 8%, transparent)',
                    }}
                  >
                    {sc.emoji ? `${sc.emoji} ` : ''}{sc.label}
                  </span>
                ))}
                {enabledShortcuts.length > 5 && (
                  <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                    +{enabledShortcuts.length - 5} más
                  </span>
                )}
              </div>
            )}
          </InfoCard>

          {/* Agent Card */}
          <InfoCard
            title="Agente"
            icon={<Bot size={15} />}
            headerActions={
              agent ? (
                <Link
                  href={`/dashboard/agents/${agent._id}`}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--primary)',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    padding: '5px 11px',
                    borderRadius: 8,
                    border: '1px solid color-mix(in oklab, var(--primary) 38%, transparent)',
                    background: 'color-mix(in oklab, var(--primary) 10%, transparent)',
                  }}
                >
                  Abrir agente →
                </Link>
              ) : null
            }
          >
            {agent ? (
              <>
                <Row label="Nombre" value={agent.name} />
                <Row label="ID Landing" value={agent._id} mono />
                {agent.agentHubId && <Row label="ID Hub" value={agent.agentHubId} mono />}
                <Row label="Estado" value={agent.status === 'active' ? <span style={{ color: '#22c55e' }}>Activo</span> : <span style={{ color: '#ef4444' }}>{agent.status}</span>} />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    padding: '3px 0',
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: 'var(--muted-foreground)', minWidth: 90 }}>Sync</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 8,
                      flexWrap: 'wrap',
                      flex: 1,
                    }}
                  >
                    {syncBadge(agent.syncStatus)}
                    {!agent.isPlatform &&
                      (agent.syncStatus === 'failed' || agent.syncStatus === 'error') && (
                        <button
                          type="button"
                          disabled={hubRetryLoading}
                          onClick={() => void retryCatalogHubSync()}
                          title="Reintentar sincronización con AIBackHub (catálogo)"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '4px 10px',
                            borderRadius: 8,
                            border: '1px solid color-mix(in oklab, #0d9488 35%, transparent)',
                            background: 'color-mix(in oklab, #0d9488 12%, transparent)',
                            color: '#0f766e',
                            cursor: hubRetryLoading ? 'wait' : 'pointer',
                            opacity: hubRetryLoading ? 0.75 : 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <RefreshCw size={12} style={hubRetryLoading ? { animation: 'afhub-spin .7s linear infinite' } : undefined} />
                          Sincronizar
                        </button>
                      )}
                  </span>
                </div>
                {hubRetryHint ? (
                  <p style={{ fontSize: 11, color: '#ef4444', margin: '2px 0 4px', textAlign: 'right' }}>
                    {hubRetryHint}
                  </p>
                ) : null}
                <Row
                  label="Tipo"
                  value={
                    <span style={{ color: isMultiAgentWidget ? '#6366f1' : undefined, fontWeight: isMultiAgentWidget ? 700 : 500 }}>
                      {widget ? resolveAgentRoleLabel(agent, widget) : 'Agente'}
                    </span>
                  }
                />
                <Row label="Modelo" value={agent.model || 'gemini-2.5-flash'} mono />
                {typeof agent.inferenceTemperature === 'number' && (
                  <Row label="Temperatura" value={String(agent.inferenceTemperature)} />
                )}
                {typeof agent.inferenceMaxTokens === 'number' && (
                  <Row label="Max tokens" value={agent.inferenceMaxTokens.toLocaleString()} />
                )}
                {(agent.tools?.length ?? 0) > 0 && (
                  <Row label="Herramientas" value={`${agent.tools!.length} configuradas`} />
                )}
                {(agent.skills?.length ?? 0) > 0 && (
                  <Row label="Skills" value={agent.skills!.join(', ')} />
                )}
                {agent.strictPurposeOnly !== undefined && (
                  <Row label="Modo estricto" value={agent.strictPurposeOnly
                    ? <span style={{ color: '#22c55e' }}>Activado</span>
                    : <span style={{ color: 'var(--muted-foreground)' }}>Desactivado</span>
                  } />
                )}
                {agent.description && (
                  <Row
                    label="Descripción"
                    value={
                      <span style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'normal', textAlign: 'right', maxWidth: 220, display: 'inline-block' }}>
                        {agent.description.slice(0, 160)}{agent.description.length > 160 ? '…' : ''}
                      </span>
                    }
                  />
                )}
                {agent.ragEnabled && (
                  <Row
                    label="Almacenamiento"
                    value={
                      <span style={{ color: '#22c55e' }}>
                        Activo ({agent.ragSources?.length ?? 0} fuente{(agent.ragSources?.length ?? 0) !== 1 ? 's' : ''})
                      </span>
                    }
                  />
                )}
                {(agent.enabledMcpToolIds?.length ?? 0) > 0 && (
                  <Row label="MCP habilitadas" value={`${agent.enabledMcpToolIds!.length} tools`} />
                )}
                {agent.isPlatform && (
                  <Row label="Origen" value={<span style={{ color: '#6366f1' }}>Catálogo plataforma</span>} />
                )}
                {agent.createdAt && <Row label="Creado" value={formatDate(agent.createdAt)} />}
                {agent.updatedAt && <Row label="Actualizado" value={formatDate(agent.updatedAt)} />}
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '6px 0' }}>
                {widget.agentId ? 'No se pudo cargar info del agente.' : 'Sin agente asignado.'}
              </p>
            )}
          </InfoCard>

          {/* Multi-agent Card */}
          {isMultiAgentWidget && widget && (
            <InfoCard title="Equipo multi-agente" icon={<Network size={15} />}>
              <Row label="Modo" value={resolveRoutingSummary(widget, subAgentCount)} />
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--muted-foreground)',
                  lineHeight: 1.45,
                  padding: '8px 10px',
                  borderRadius: 8,
                  marginTop: 4,
                  marginBottom: 8,
                  background: 'color-mix(in oklab, #6366f1 6%, transparent)',
                  border: '1px solid color-mix(in oklab, #6366f1 12%, transparent)',
                }}
              >
                {describeRoutingFlow(widget, subAgentCount)}
              </div>
              {agent && (
                <SubAgentList
                  title="Orquestador principal"
                  agents={[{ _id: agent._id, name: agent.name, model: agent.model, status: agent.status, syncStatus: agent.syncStatus }]}
                  tone="orch"
                />
              )}
              {extraOrchestrators.length > 0 && (
                <SubAgentList title="Orquestadores adicionales" agents={extraOrchestrators} tone="orch" />
              )}
              {subAgentCount > 0 ? (
                <SubAgentList
                  title={`Sub-agentes (${subAgentCount})`}
                  agents={
                    subAgents.length > 0
                      ? subAgents
                      : (agent?.subAgentIds ?? []).map((id) => ({ _id: id, name: id }))
                  }
                  tone="sub"
                />
              ) : widget.multiAgentEnabled ? (
                <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '6px 0' }}>
                  Sin sub-agentes en el orquestador principal. El routing usa orquestadores y especialistas del widget.
                </p>
              ) : null}
              {teamSpecialists.length > 0 && (
                <SubAgentList
                  title={`Especialistas del widget (${teamSpecialists.length})`}
                  agents={teamSpecialists}
                  tone="spec"
                />
              )}
            </InfoCard>
          )}

          {/* Single-agent capabilities */}
          {!isMultiAgentWidget && agent && (
            <InfoCard title="Agente único" icon={<Sparkles size={15} />}>
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '0 0 8px', lineHeight: 1.45 }}>
                Este widget responde con un solo agente. No hay triaje ni delegación a sub-agentes.
              </p>
              <Row label="Modelo" value={agent.model || 'gemini-2.5-flash'} mono />
              <Row label="Proveedor" value={inferProvider(agent.model || '')} />
              <Row label="MCP conectadas" value={`${syncedServers.length}/${mcpServers.length} servidores · ${totalMcpTools} tools`} />
              <Row label="Built-in" value={builtInTools.length > 0 ? builtInTools.map((t) => t.toolId).join(', ') : '—'} />
              {(agent.skills?.length ?? 0) > 0 && (
                <Row label="Skills" value={agent.skills!.join(', ')} />
              )}
            </InfoCard>
          )}

          {/* Capabilities summary (all agents) */}
          {agent && (
            <InfoCard title="Resumen de capacidades" icon={<Layers size={15} />}>
              <CapabilityGrid
                items={[
                  { label: 'Tipo', value: agentRoleLabel },
                  { label: 'Modelo', value: agent.model || 'gemini-2.5-flash' },
                  { label: 'MCP tools', value: String(totalMcpTools) },
                  { label: 'Built-in', value: String(builtInTools.length) },
                  { label: 'RAG', value: agent.ragEnabled ? `Sí (${agent.ragSources?.length ?? 0})` : 'No' },
                  { label: 'Skills', value: String(agent.skills?.length ?? 0) },
                  { label: 'Sub-agentes', value: String(subAgentCount) },
                  { label: 'Atajos', value: String(enabledShortcuts.length) },
                ]}
              />
            </InfoCard>
          )}

          {/* Model Card */}
          <InfoCard title="Modelo" icon={<Cpu size={15} />}>
            {agent ? (
              <>
                <Row label="Modelo" value={agent.model || 'gemini-2.5-flash'} mono />
                <Row label="Proveedor" value={inferProvider(agent.model || '')} />
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '6px 0' }}>—</p>
            )}
          </InfoCard>

          {/* MCP Tools Card */}
          <InfoCard
            title={`MCP Tools (${totalMcpTools})`}
            icon={<Wrench size={15} />}
          >
            {mcpServers.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '6px 0' }}>
                Sin conexiones MCP configuradas.
              </p>
            )}
            {mcpServers.map((srv) => (
              <div key={srv.connectionId} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>{srv.serverName}</span>
                  {syncBadge(srv.syncStatus)}
                </div>
                {srv.tools.length === 0 ? (
                  <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 12 }}>
                    Sin tools descubiertas.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginLeft: 12 }}>
                    {srv.tools.map((t) => (
                      <span
                        key={t.id}
                        title={t.description || t.id}
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 99,
                          background: srv.syncStatus === 'ok'
                            ? 'color-mix(in oklab, #0d9488 15%, transparent)'
                            : 'color-mix(in oklab, var(--foreground) 8%, transparent)',
                          color: srv.syncStatus === 'ok' ? '#0d9488' : 'var(--muted-foreground)',
                          border: '1px solid color-mix(in oklab, var(--foreground) 10%, transparent)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {builtInTools.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 12 }}>Built-in tools</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, marginLeft: 12 }}>
                  {builtInTools.map((t) => (
                    <span
                      key={t.toolId}
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 99,
                        background: 'color-mix(in oklab, var(--foreground) 6%, transparent)',
                        color: 'var(--muted-foreground)',
                        border: '1px solid color-mix(in oklab, var(--foreground) 8%, transparent)',
                      }}
                    >
                      {t.toolId}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </InfoCard>

          {/* Embed Card */}
          <InfoCard title="Embed" icon={<Globe size={15} />}>
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '4px 0 6px' }}>
              Copia este snippet para incrustar el widget:
            </p>
            <code
              style={{
                display: 'block',
                fontSize: 10,
                padding: '8px 10px',
                borderRadius: 6,
                background: 'color-mix(in oklab, var(--foreground) 5%, transparent)',
                border: '1px solid color-mix(in oklab, var(--foreground) 10%, transparent)',
                wordBreak: 'break-all',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {`<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js"></script>\n<script>\n  AgentFlowhub.init({\n    agentId: "${widget.agentId}",\n    widgetId: "${widget._id}",\n    host: "${typeof window !== 'undefined' ? window.location.origin : ''}",${widget.afhubToken ? `\n    token: "${widget.afhubToken}",` : ''}\n  });\n</script>`}
            </code>
          </InfoCard>
        </div>
      )}
    </div>
  );
}

/* ── Small helper components ──────────────────────────────────────────── */

function InfoCard({
  title,
  icon,
  headerActions,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 10,
        border: '1px solid color-mix(in oklab, var(--foreground) 10%, transparent)',
        background: 'color-mix(in oklab, var(--foreground) 2%, transparent)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: '1px solid color-mix(in oklab, var(--foreground) 8%, transparent)',
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {icon} {title}
        </span>
        {headerActions ? <span style={{ flexShrink: 0 }}>{headerActions}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--muted-foreground)', minWidth: 90 }}>{label}</span>
      <span style={{
        fontWeight: 500,
        textAlign: 'right',
        maxWidth: 220,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...(mono ? { fontFamily: 'monospace', fontSize: 11 } : {}),
      }}>
        {value}
      </span>
    </div>
  );
}

function inferProvider(model: string): string {
  if (!model) return '—';
  if (model.startsWith('hf/') || model.includes('Qwen') || model.includes('Llama') || model.includes('Mistral')) return 'HuggingFace';
  if (model.startsWith('claude')) return 'Anthropic';
  if (model.startsWith('deepseek')) return 'DeepSeek';
  if (model.startsWith('vx/')) return 'Vertex AI';
  if (model.startsWith('gemini') || model.startsWith('gemma')) return 'Google AI';
  return 'Auto';
}

function formatMultiAgentMode(mode?: string): string {
  if (mode === 'parallel') return 'Paralelo + síntesis';
  if (mode === 'pipeline') return 'Pipeline contenido→creativo';
  return 'Triaje automático';
}

function describeRoutingFlow(widget: WidgetDoc, subAgentCount: number): string {
  if (widget.multiAgentEnabled) {
    if (widget.multiAgentMode === 'pipeline') {
      return 'El mensaje pasa por etapas: un orquestador genera contenido y otro lo refina o adapta (pipeline).';
    }
    if (widget.multiAgentMode === 'parallel') {
      return 'Varios agentes responden en paralelo; un orquestador sintetiza la mejor respuesta final.';
    }
    return 'Un orquestador analiza la intención y enruta al especialista más adecuado del equipo.';
  }
  if (subAgentCount > 0) {
    return `Triaje automático: el orquestador principal elige entre ${subAgentCount} sub-agente${subAgentCount !== 1 ? 's' : ''} según el mensaje del usuario.`;
  }
  return 'Sin delegación: todas las respuestas las genera el agente principal.';
}

function TypeBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'multi' | 'single' | 'platform' | 'ok' | 'warn' | 'neutral';
}) {
  const styles: Record<typeof tone, { bg: string; color: string; border: string }> = {
    multi: { bg: 'color-mix(in oklab, #6366f1 14%, transparent)', color: '#4f46e5', border: 'color-mix(in oklab, #6366f1 28%, transparent)' },
    single: { bg: 'color-mix(in oklab, #0d9488 12%, transparent)', color: '#0f766e', border: 'color-mix(in oklab, #0d9488 28%, transparent)' },
    platform: { bg: 'color-mix(in oklab, #8b5cf6 12%, transparent)', color: '#7c3aed', border: 'color-mix(in oklab, #8b5cf6 28%, transparent)' },
    ok: { bg: 'color-mix(in oklab, #22c55e 12%, transparent)', color: '#16a34a', border: 'color-mix(in oklab, #22c55e 28%, transparent)' },
    warn: { bg: 'color-mix(in oklab, #f59e0b 12%, transparent)', color: '#d97706', border: 'color-mix(in oklab, #f59e0b 28%, transparent)' },
    neutral: { bg: 'color-mix(in oklab, var(--foreground) 6%, transparent)', color: 'var(--muted-foreground)', border: 'color-mix(in oklab, var(--foreground) 12%, transparent)' },
  };
  const s = styles[tone];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 99,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {label}
    </span>
  );
}

function SubAgentList({
  title,
  agents,
  tone,
}: {
  title: string;
  agents: SubAgentSummary[];
  tone: 'orch' | 'sub' | 'spec';
}) {
  const accent =
    tone === 'orch' ? '#0d9488' : tone === 'spec' ? '#f59e0b' : '#6366f1';
  return (
    <div style={{ marginTop: 10 }}>
      <span style={{ fontWeight: 700, fontSize: 12 }}>{title}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        {agents.map((sub) => {
          const modelLabel =
            typeof sub.model === 'string' && sub.model.trim() ? sub.model.trim() : null;
          const statusColor = sub.status === 'active' ? '#22c55e' : '#ef4444';
          return (
            <div
              key={sub._id}
              style={{
                fontSize: 11,
                padding: '8px 10px',
                borderRadius: 8,
                background: `color-mix(in oklab, ${accent} 8%, transparent)`,
                border: `1px solid color-mix(in oklab, ${accent} 18%, transparent)`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700 }}>{sub.name}</span>
                    {sub.status && (
                      <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>{sub.status}</span>
                    )}
                    {sub.syncStatus && (
                      <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{sub.syncStatus}</span>
                    )}
                  </div>
                  {sub.description && (
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--muted-foreground)', lineHeight: 1.35 }}>
                      {sub.description.slice(0, 100)}{sub.description.length > 100 ? '…' : ''}
                    </p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, fontSize: 10, color: 'var(--muted-foreground)' }}>
                    {modelLabel && <span style={{ fontFamily: 'monospace' }}>{modelLabel}</span>}
                    {typeof sub.toolsCount === 'number' && <span>{sub.toolsCount} tools</span>}
                    {sub.ragEnabled && <span>RAG</span>}
                  </div>
                </div>
                {/^[a-f0-9]{24}$/i.test(sub._id) && (
                  <Link
                    href={`/dashboard/agents/${sub._id}`}
                    title="Abrir agente"
                    style={{ color: accent, flexShrink: 0, display: 'inline-flex' }}
                  >
                    <ExternalLink size={13} />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CapabilityGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 8,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: 'color-mix(in oklab, var(--foreground) 4%, transparent)',
            border: '1px solid color-mix(in oklab, var(--foreground) 8%, transparent)',
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginBottom: 2 }}>{item.label}</div>
          <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function resolveAgentRoleLabel(
  agent: AgentDoc,
  widget: WidgetDoc,
): string {
  if (agent.type === 'sub-agent') return 'Sub-agente';
  if (widget.multiAgentEnabled) return 'Orquestador (multi-agente avanzado)';
  if ((agent.subAgentIds?.length ?? 0) > 0) return 'Orquestador (triaje automático)';
  return 'Agente';
}

function resolveRoutingSummary(widget: WidgetDoc, subAgentCount: number): string {
  if (widget.multiAgentEnabled) {
    const orchCount = 1 + (widget.orchestratorAgentIds?.length ?? 0);
    const specialistCount = widget.agentIds?.length ?? 0;
    return `${formatMultiAgentMode(widget.multiAgentMode)} · ${orchCount} orquestador${orchCount !== 1 ? 'es' : ''}${specialistCount > 0 ? ` · ${specialistCount} especialista${specialistCount !== 1 ? 's' : ''}` : ''}`;
  }
  if (subAgentCount > 0) {
    return `Triaje automático · ${subAgentCount} sub-agente${subAgentCount !== 1 ? 's' : ''} del orquestador`;
  }
  return 'Agente único (sin delegación)';
}
