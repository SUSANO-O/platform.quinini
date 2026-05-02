'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
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
} from 'lucide-react';

declare global {
  interface Window {
    AgentFlowhub?: {
      init: (cfg: Record<string, unknown>) => { destroy?: () => void } | void;
    };
  }
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
  avatar?: string;
  position: string;
  theme: string;
  borderRadius?: string;
  autoOpen?: boolean;
  afhubToken?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface AgentDoc {
  _id: string;
  name: string;
  description?: string;
  model?: string;
  status?: string;
  syncStatus?: string;
  agentHubId?: string;
  isPlatform?: boolean;
  tools?: { toolId: string; config?: unknown }[];
  ragEnabled?: boolean;
  ragSources?: { type: string; name: string }[];
  type?: string;
  subAgentIds?: string[];
}

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

const syncBadge = (status?: string) => {
  if (status === 'ok' || status === 'synced') return <span style={{ color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><CheckCircle2 size={13} /> Sincronizado</span>;
  if (status === 'error' || status === 'failed') return <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><XCircle size={13} /> Error</span>;
  return <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><Clock size={13} /> Pendiente</span>;
};

export default function WidgetPreviewPage() {
  const [widget, setWidget] = useState<WidgetDoc | null>(null);
  const [agent, setAgent] = useState<AgentDoc | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hubRetryLoading, setHubRetryLoading] = useState(false);
  const [hubRetryHint, setHubRetryHint] = useState('');
  const instanceRef = useRef<{ destroy?: () => void } | null>(null);

  useEffect(() => {
    const id =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('id')
        : null;
    const valid = id && /^[a-f0-9]{24}$/i.test(id) ? id : null;

    if (!valid) {
      setError('Falta un id de widget válido en la URL (?id=…).');
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const wRes = await fetch(`/api/widgets/${valid}`);
        const wData = await wRes.json();
        if (cancelled) return;
        if (!wData.widget) {
          setError(wData.error || 'Widget no encontrado.');
          setLoading(false);
          return;
        }
        const w = wData.widget as WidgetDoc;
        setWidget(w);

        if (w.agentId?.trim()) {
          const [agentRes, mcpRes] = await Promise.all([
            fetch(`/api/agents/${w.agentId}`).catch(() => null),
            fetch(`/api/mcp/agent-tools?agentId=${encodeURIComponent(w.agentId)}`).catch(() => null),
          ]);

          if (!cancelled && agentRes?.ok) {
            const aData = await agentRes.json().catch(() => ({}));
            const ag = aData?.agent ?? aData?.data ?? null;
            if (ag) setAgent(ag as AgentDoc);
          }
          if (!cancelled && mcpRes?.ok) {
            const mData = await mcpRes.json().catch(() => ({}));
            setMcpServers(mData?.servers ?? []);
          }
        }
      } catch {
        if (!cancelled) setError('No se pudo cargar el widget.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
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

  const teardown = useCallback(() => {
    try { instanceRef.current?.destroy?.(); } catch { /* ignore */ }
    instanceRef.current = null;
  }, []);

  useEffect(() => {
    if (!widget || typeof window === 'undefined') return;
    if (!widget.agentId?.trim()) return;

    const host = window.location.origin;
    if (!/^https?:\/\//i.test(host)) return;

    const snapshot = widget;
    let cancelled = false;

    async function boot() {
      teardown();
      const origin = window.location.origin;

      const loadScript = (): Promise<void> => {
        /**
         * `public/widget.js` solo registra el SDK si `window.AgentFlowhub` no existe (guard global).
         * Si el navegador sirvió una copia cacheada antigua, cualquier script nuevo se ignora por completo.
         * En vista previa forzamos siempre la última versión del archivo y permitimos re-ejecutar el IIFE.
         */
        try {
          document.querySelectorAll('script[data-afhub-widget-preview]').forEach((node) => node.remove());
        } catch {
          /* ignore */
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any).AgentFlowhub;
        } catch {
          /* ignore */
        }

        return new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = `${origin}/widget.js?v=${encodeURIComponent(String(Date.now()))}`;
          s.async = true;
          s.setAttribute('data-afhub-widget-preview', '1');
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('No se pudo cargar widget.js'));
          document.body.appendChild(s);
        });
      };

      try {
        await loadScript();
        if (cancelled || !window.AgentFlowhub) return;

        const w = snapshot;
        const token = typeof w.afhubToken === 'string' && w.afhubToken.startsWith('wt_') ? w.afhubToken : '';

        const cfg: Record<string, unknown> = {
          agentId: w.agentId,
          widgetId: w._id,
          host,
          color: w.color || '#0d9488',
          title: w.title || 'Asistente',
          subtitle: w.subtitle || '',
          welcome: w.welcome || '',
          fabHint: w.fabHint || '',
          humanSupportPhone: typeof w.humanSupportPhone === 'string' ? w.humanSupportPhone : '',
          avatar: w.avatar || '',
          position: w.position || 'bottom-right',
          theme: w.theme === 'dark' ? 'dark' : 'light',
          borderRadius: parseBorderRadius(w.borderRadius),
          autoOpen: true,
          token,
        };

        const api = window.AgentFlowhub.init(cfg);
        instanceRef.current = api && typeof api === 'object' ? api : null;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al iniciar el widget.');
      }
    }

    boot();
    return () => { cancelled = true; teardown(); };
  }, [widget, teardown]);

  const totalMcpTools = mcpServers.reduce((s, g) => s + g.tools.length, 0);
  const syncedServers = mcpServers.filter((s) => s.syncStatus === 'ok');
  const builtInTools = agent?.tools?.filter((t) => !t.toolId.startsWith('mcp:') && !t.toolId.startsWith('std:')) ?? [];

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
      <p style={{ color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 20 }}>
        {widget
          ? `Probando «${widget.name}». Usa el botón flotante para chatear.`
          : loading
            ? 'Cargando configuración…'
            : 'Abre esta vista desde Mis widgets con el botón Preview.'}
      </p>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted-foreground)' }}>
          <Loader2 size={20} style={{ animation: 'spin .7s linear infinite' }} />
          <span style={{ fontSize: 13 }}>Cargando…</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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
          <InfoCard title="Widget" icon={<Palette size={15} />}>
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
              value={widget.humanSupportPhone?.trim() ? widget.humanSupportPhone.trim() : '—'}
            />
            <Row label="Token" value={widget.afhubToken ? <span style={{ color: '#22c55e', fontSize: 11 }}><Shield size={11} /> Asignado</span> : <span style={{ color: '#f59e0b', fontSize: 11 }}>Sin token</span>} />
            <Row label="Creado" value={formatDate(widget.createdAt)} />
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
                <Row label="Tipo" value={agent.type === 'sub-agent' ? 'Sub-agente' : 'Agente'} />
                {agent.description && <Row label="Descripción" value={<span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{agent.description.slice(0, 120)}{agent.description.length > 120 ? '…' : ''}</span>} />}
                {agent.ragEnabled && <Row label="RAG" value={<span style={{ color: '#22c55e' }}>Activo ({agent.ragSources?.length ?? 0} fuentes)</span>} />}
                {(agent.subAgentIds?.length ?? 0) > 0 && <Row label="Sub-agentes" value={`${agent.subAgentIds!.length}`} />}
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '6px 0' }}>
                {widget.agentId ? 'No se pudo cargar info del agente.' : 'Sin agente asignado.'}
              </p>
            )}
          </InfoCard>

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
