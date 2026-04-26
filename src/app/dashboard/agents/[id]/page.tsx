'use client';

import {
  useEffect, useState, use, useMemo, useCallback, useRef,
  type CSSProperties, type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useSubscription } from '@/hooks/use-subscription';
import { useClientModels, mergeSavedModelOptions } from '@/hooks/use-client-models';
import { TOOLS, getAgentLimits, TOOL_MAP } from '@/lib/agent-plans';
import {
  Bot, ChevronLeft, Save, Loader2, Plus, Trash2, Network,
  Zap, Wrench, Settings, Lock, CircleOff, Upload, FileText,
  Image as ImageIcon, File, Link2, AlignLeft, CheckCircle2,
  AlertCircle, X, KeyRound, RefreshCw, Sparkles,
} from 'lucide-react';

const R = '#e41414';
const O = '#f87600';
const B = '#00acf8';
const BTN_PRIMARY: CSSProperties = {
  background: `linear-gradient(135deg, ${R}, ${O})`,
  color: '#fff',
  border: 'none',
  boxShadow: '0 4px 18px rgba(228,20,20,0.28)',
};
import Link from 'next/link';
import { McpLandingConnectForm } from '@/components/mcp/mcp-landing-connect-form';
import { AgentMcpOpenFromQuery } from '@/components/mcp/agent-mcp-open-from-query';
import { AgentHubspotOauthReturn } from '@/components/mcp/agent-hubspot-oauth-return';
import { McpAgentStandardCredentialsEditor } from '@/components/mcp/mcp-agent-standard-credentials-editor';

type Tab = 'general' | 'tools' | 'rag' | 'subagents';

interface McpServerGroup {
  integrationKey: string;
  serverName: string;
  description: string;
  syncStatus: 'ok' | 'pending' | 'error';
  connectionId: string;
  tools: { id: string; name: string; description: string }[];
  credentialFields: { key: string; label: string; secret: boolean; required: boolean }[];
  credentialsMask: Record<string, string>;
  lastSyncAt?: string;
  lastSyncError?: string;
}

interface AgentHubLinkInfo {
  hasAgentHubId: boolean;
  agentHubId: string | null;
  catalogSyncStatus: string;
}

function formatMcpLastSync(iso?: string): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
}

function mcpConnectionBadgeStyle(s: McpServerGroup): { label: string; bg: string; color: string } {
  if (s.syncStatus === 'ok') {
    return { label: '✓ MCP sync OK', bg: 'rgba(34,197,94,0.12)', color: '#22c55e' };
  }
  if (s.syncStatus === 'error') {
    return { label: 'Error sync MCP', bg: 'rgba(239,68,68,0.12)', color: '#ef4444' };
  }
  return { label: 'Pendiente MCP', bg: 'rgba(217,119,6,0.12)', color: '#d97706' };
}

function SectionCard({
  children,
  bar = 'rb' as 'rb' | 'bo',
  className,
  innerStyle,
  outerStyle,
}: {
  children: ReactNode;
  bar?: 'rb' | 'bo';
  className?: string;
  innerStyle?: CSSProperties;
  outerStyle?: CSSProperties;
}) {
  const barBg = bar === 'bo' ? `linear-gradient(90deg, ${B}, ${O})` : `linear-gradient(90deg, ${R}, ${B})`;
  return (
    <div
      className={`rounded-2xl overflow-hidden border mb-4 card-texture card-hover ${className ?? ''}`}
      style={{ borderColor: 'var(--border)', ...outerStyle }}
    >
      <div className="h-[3px]" style={{ background: barBg }} />
      <div className="p-5" style={innerStyle}>
        {children}
      </div>
    </div>
  );
}

interface ToolConfig { toolId: string; config: Record<string, string> }

function normalizeTools(raw: ToolConfig[] | undefined | null): ToolConfig[] {
  return (raw ?? []).map((t) => ({
    toolId: t.toolId,
    config: t.config && typeof t.config === 'object' ? t.config : {},
  }));
}
interface RagSource {
  type: 'url' | 'text' | 'file';
  name: string;
  content: string;
  fileId?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  fileSize?: number | null;
  fileCategory?: string | null;
  charCount?: number;
  warning?: string | null;
  uploadedAt?: string | null;
}
interface ClientAgent {
  _id: string; name: string; description: string; systemPrompt: string;
  model: string;
  inferenceTemperature?: number | null;
  inferenceMaxTokens?: number | null;
  type: 'agent' | 'sub-agent'; status: 'active' | 'disabled';
  tools: ToolConfig[]; ragEnabled: boolean; ragSources: RagSource[];
  subAgentIds: string[]; syncStatus: string; agentHubId: string | null;
  widgetPublicToken?: string | null;
  persistConversationHistory?: boolean;
  enabledMcpToolIds?: string[];
  /** Catálogo global (solo lectura en la landing; edición en AgentFlowHub). */
  isPlatform?: boolean;
}
interface SubAgent {
  _id: string; name: string; model: string; status: 'active' | 'disabled';
  tools: ToolConfig[];
}

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { subscription } = useSubscription();
  const plan = subscription?.plan ?? 'free';
  const limits = getAgentLimits(plan);

  const [agent, setAgent] = useState<ClientAgent | null>(null);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [tab, setTab] = useState<Tab>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState('');
  const [tools, setTools] = useState<ToolConfig[]>([]);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragSources, setRagSources] = useState<RagSource[]>([]);
  const [widgetPublicToken, setWidgetPublicToken] = useState('');
  const [persistConversationHistory, setPersistConversationHistory] = useState(true);
  const [inferenceTemperature, setInferenceTemperature] = useState('');
  const [inferenceMaxTokens, setInferenceMaxTokens] = useState('');
  const [modelQuery, setModelQuery] = useState('');
  const [showAllModels, setShowAllModels] = useState(false);

  // MCP tools state
  const [mcpServers, setMcpServers] = useState<McpServerGroup[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpToolIds, setMcpToolIds] = useState<string[]>([]);
  const [mcpAgentHubLink, setMcpAgentHubLink] = useState<AgentHubLinkInfo | null>(null);
  const enabledMcpSavedRef = useRef<string[] | undefined>(undefined);
  useEffect(() => {
    enabledMcpSavedRef.current = agent?.enabledMcpToolIds;
  }, [agent?.enabledMcpToolIds]);

  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploadErr, setUploadErr] = useState('');

  // Sub-agent creation
  const [showNewSub, setShowNewSub] = useState(false);
  const [subName, setSubName] = useState('');
  const [subPrompt, setSubPrompt] = useState('');
  const [subModel, setSubModel] = useState('gemini-2.5-flash');
  const [creatingSubAgent, setCreatingSubAgent] = useState(false);

  const { models: clientModels, hubError: modelsHubError } = useClientModels(plan);
  const displayModels = useMemo(
    () => mergeSavedModelOptions(clientModels, model, subModel),
    [clientModels, model, subModel],
  );
  const mainModelUnknown = useMemo(
    () => Boolean(model.trim()) && !clientModels.some((x) => x.id === model),
    [clientModels, model],
  );
  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return displayModels;
    return displayModels.filter((m) =>
      `${m.name} ${m.id} ${m.provider} ${m.description ?? ''}`.toLowerCase().includes(q)
    );
  }, [displayModels, modelQuery]);
  const orderedFilteredModels = useMemo(() => {
    const selectedIndex = filteredModels.findIndex((m) => m.id === model);
    if (selectedIndex <= 0) return filteredModels;
    const selectedModel = filteredModels[selectedIndex];
    return [selectedModel, ...filteredModels.slice(0, selectedIndex), ...filteredModels.slice(selectedIndex + 1)];
  }, [filteredModels, model]);
  const visibleModels = showAllModels ? orderedFilteredModels : orderedFilteredModels.slice(0, 12);

  useEffect(() => {
    fetch(`/api/agents/${id}`)
      .then((r) => r.json())
      .then(({ agent: a, subAgents: sa }) => {
        if (!a) { router.push('/dashboard/agents'); return; }
        setAgent(a);
        if (a.isPlatform) setShowNewSub(false);
        setSubAgents(sa ?? []);
        setName(a.name); setDescription(a.description);
        setSystemPrompt(a.systemPrompt); setModel(a.model);
        setTools(normalizeTools(a.tools));
        setRagEnabled(a.ragEnabled);
        setRagSources(a.ragSources ?? []);
        setWidgetPublicToken(typeof a.widgetPublicToken === 'string' ? a.widgetPublicToken : '');
        setPersistConversationHistory(
          typeof a.persistConversationHistory === 'boolean' ? a.persistConversationHistory : true,
        );
        setInferenceTemperature(
          typeof a.inferenceTemperature === 'number' ? String(a.inferenceTemperature) : '',
        );
        setInferenceMaxTokens(
          typeof a.inferenceMaxTokens === 'number' ? String(a.inferenceMaxTokens) : '',
        );
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  const onOpenToolsTab = useCallback(() => setTab('tools'), []);

  const loadMcp = useCallback(() => {
    if (!id) return;
    setMcpLoading(true);
    fetch(`/api/mcp/agent-tools?agentId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        const raw = (data?.servers ?? []) as McpServerGroup[];
        const srvs: McpServerGroup[] = raw.map((s) => ({
          ...s,
          credentialFields: Array.isArray(s.credentialFields) ? s.credentialFields : [],
          credentialsMask:
            s.credentialsMask && typeof s.credentialsMask === 'object' ? s.credentialsMask : {},
          lastSyncAt: typeof s.lastSyncAt === 'string' ? s.lastSyncAt : undefined,
          lastSyncError: typeof s.lastSyncError === 'string' ? s.lastSyncError : undefined,
        }));
        setMcpServers(srvs);
        const link = data?.agentHubLink;
        if (link && typeof link === 'object') {
          setMcpAgentHubLink({
            hasAgentHubId: Boolean(link.hasAgentHubId),
            agentHubId: typeof link.agentHubId === 'string' ? link.agentHubId : null,
            catalogSyncStatus: typeof link.catalogSyncStatus === 'string' ? link.catalogSyncStatus : 'unknown',
          });
        } else {
          setMcpAgentHubLink(null);
        }
        const allIds = srvs.filter((s) => s.syncStatus === 'ok').flatMap((s) => s.tools.map((t) => t.id));
        const saved = enabledMcpSavedRef.current;
        if (Array.isArray(saved)) {
          if (saved.length === 0) {
            setMcpToolIds([]);
          } else {
            const v = saved.filter((tid) => allIds.includes(tid));
            setMcpToolIds(v.length > 0 ? v : allIds);
          }
        } else {
          setMcpToolIds(allIds);
        }
      })
      .catch(() => {
        setMcpServers([]);
        setMcpAgentHubLink(null);
      })
      .finally(() => setMcpLoading(false));
  }, [id]);

  useEffect(() => {
    loadMcp();
  }, [loadMcp]);

  const onHubspotOauthReturn = useCallback(
    (kind: 'ok' | 'partial' | 'err', detail?: string) => {
      setError('');
      setSuccess('');
      loadMcp();
      if (kind === 'ok') {
        setSuccess('HubSpot conectado y sincronizado.');
      } else if (kind === 'partial') {
        setSuccess(
          detail?.trim() ||
            'HubSpot autorizado; si la sincronización falló, pulsa Sincronizar en la conexión.',
        );
      } else {
        setError(detail?.trim() || 'No se pudo completar la conexión OAuth con HubSpot.');
      }
    },
    [loadMcp],
  );

  async function resyncMcpConnection(connectionId: string) {
    setError('');
    const r = await fetch(
      `/api/mcp/connections/${encodeURIComponent(connectionId)}/sync?landingAgentId=${encodeURIComponent(id)}`,
      { method: 'POST', credentials: 'include' },
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j?.error ?? 'No se pudo sincronizar la conexión MCP.');
      return;
    }
    loadMcp();
  }

  async function deleteMcpConnection(connectionId: string) {
    if (!confirm('¿Quitar esta conexión MCP de este agente? Las credenciales dejarán de aplicarse.')) return;
    setError('');
    const r = await fetch(
      `/api/mcp/connections/${encodeURIComponent(connectionId)}?landingAgentId=${encodeURIComponent(id)}`,
      { method: 'DELETE', credentials: 'include' },
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j?.error ?? 'No se pudo eliminar la conexión.');
      return;
    }
    loadMcp();
  }

  function toggleMcpTool(toolId: string) {
    setMcpToolIds((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId],
    );
  }

  const syncedMcpServers = useMemo(
    () => mcpServers.filter((s) => s.syncStatus === 'ok' && s.tools.length > 0),
    [mcpServers],
  );

  const pendingOrErrorMcpServers = useMemo(
    () => mcpServers.filter((s) => s.syncStatus !== 'ok'),
    [mcpServers],
  );

  async function save(patch: Record<string, unknown>) {
    setSaving(true); setError(''); setSuccess('');
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? 'Error al guardar.'); return false; }
    setAgent(data.agent);
    if (data.agent?.tools) setTools(normalizeTools(data.agent.tools));
    if (data.agent && 'widgetPublicToken' in data.agent) {
      setWidgetPublicToken(typeof data.agent.widgetPublicToken === 'string' ? data.agent.widgetPublicToken : '');
    }
    setSuccess('Guardado.');
    setTimeout(() => setSuccess(''), 2500);
    return true;
  }

  function generatePublicToken() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    setWidgetPublicToken(`afhub_pub_${hex}`);
  }

  async function saveGeneral() {
    const t = inferenceTemperature.trim();
    const m = inferenceMaxTokens.trim();
    const patch: Record<string, unknown> = {
      name,
      description,
      systemPrompt,
      model,
      widgetPublicToken: widgetPublicToken.trim() ? widgetPublicToken.trim().slice(0, 512) : null,
      persistConversationHistory,
    };
    if (t === '') {
      patch.inferenceTemperature = null;
    } else {
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0 || n > 2) {
        setError('Temperatura: número entre 0 y 2, o vacío para el catálogo.');
        return;
      }
      patch.inferenceTemperature = n;
    }
    if (m === '') {
      patch.inferenceMaxTokens = null;
    } else {
      const n = parseInt(m, 10);
      if (!Number.isFinite(n) || n < 1) {
        setError('Max tokens salida: entero ≥ 1 o vacío.');
        return;
      }
      patch.inferenceMaxTokens = n;
    }
    await save(patch);
  }

  async function saveTools() {
    await save({ tools, enabledMcpToolIds: mcpToolIds });
  }

  async function saveRag() {
    await save({ ragEnabled, ragSources });
  }

  async function toggleStatus() {
    if (!agent || agent.isPlatform) return;
    await save({ status: agent.status === 'active' ? 'disabled' : 'active' });
  }

  function toggleToolSelection(toolId: string) {
    setTools((prev) => {
      if (prev.some((t) => t.toolId === toolId)) {
        return prev.filter((t) => t.toolId !== toolId);
      }
      if (prev.length >= limits.toolsPerAgent) return prev;
      return [...prev, { toolId, config: {} }];
    });
  }

  function updateToolConfig(toolId: string, key: string, value: string) {
    setTools((prev) => prev.map((t) =>
      t.toolId === toolId ? { ...t, config: { ...(t.config ?? {}), [key]: value } } : t,
    ));
  }

  function addRagSource() {
    setRagSources((prev) => [...prev, { type: 'text', name: '', content: '' }]);
  }

  function removeRagSource(i: number) {
    setRagSources((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function deleteRagSource(src: RagSource, index: number) {
    if (agent?.isPlatform) return;
    const url = src.fileId
      ? `/api/agents/${id}/rag-source?fileId=${src.fileId}`
      : `/api/agents/${id}/rag-source?index=${index}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (res.ok) {
      setRagSources((prev) => prev.filter((_, i) => i !== index));
      setAgent((prev) => prev ? { ...prev, ragSources: (prev.ragSources ?? []).filter((_, i) => i !== index) } : prev);
    }
  }

  async function uploadFile(file: File) {
    if (agent?.isPlatform) return;
    setUploadingFile(true);
    setUploadMsg('');
    setUploadErr('');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/agents/${id}/rag-upload`, { method: 'POST', body: form });
    const data = await res.json();
    setUploadingFile(false);
    if (!res.ok) { setUploadErr(data.error ?? 'Error al subir archivo.'); return; }
    // Refresh agent to get updated ragSources
    const agentRes = await fetch(`/api/agents/${id}`);
    const agentData = await agentRes.json();
    if (agentData.agent) {
      setRagSources(agentData.agent.ragSources ?? []);
      setAgent(agentData.agent);
    }
    setUploadMsg(data.message ?? 'Archivo procesado.');
    setTimeout(() => setUploadMsg(''), 4000);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = ''; // reset so same file can be re-uploaded
  }

  async function createSubAgent() {
    if (agent?.isPlatform || !subName.trim() || !subPrompt.trim()) return;
    setCreatingSubAgent(true);
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: subName, systemPrompt: subPrompt, model: subModel,
        type: 'sub-agent', parentAgentId: id,
      }),
    });
    const data = await res.json();
    setCreatingSubAgent(false);
    if (!res.ok) { setError(data.error ?? 'Error al crear sub-agente.'); return; }
    setSubAgents((prev) => [...prev, data.agent]);
    setShowNewSub(false); setSubName(''); setSubPrompt(''); setSubModel('gemini-2.5-flash');
  }

  const inp: CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: '12px',
    border: '1px solid var(--border)', background: 'var(--background)',
    color: 'var(--foreground)', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
  };
  const sectionTitle: CSSProperties = {
    fontSize: '12px', fontWeight: 700, color: 'var(--muted-foreground)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '14px',
  };

  if (loading) {
    return (
      <div className="relative overflow-hidden" style={{ minHeight: '100%' }}>
        <div className="hero-glow pointer-events-none" style={{ background: R, top: '-200px', right: '-60px' }} />
        <div className="hero-glow pointer-events-none" style={{ background: B, top: '100px', left: '-120px' }} />
        <div className="relative px-6 py-16 max-w-3xl mx-auto text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <Loader2 className="animate-spin mx-auto mb-3" size={28} style={{ color: R }} />
          Cargando agente…
        </div>
      </div>
    );
  }
  if (!agent) return null;

  const readOnly = Boolean(agent.isPlatform);
  const isDisabled = agent.status === 'disabled';
  const ragN = agent.ragSources?.length ?? 0;
  const ragLoaded = agent.ragEnabled && ragN > 0;
  const ragSummary =
    ragLoaded ? `RAG cargado (${ragN} fuente${ragN !== 1 ? 's' : ''})`
      : agent.ragEnabled && ragN === 0 ? 'RAG activo · sin fuentes'
        : !agent.ragEnabled && ragN > 0 ? `RAG off · ${ragN} fuente${ragN !== 1 ? 's' : ''} guardada${ragN !== 1 ? 's' : ''}`
          : null;
  const conversationSyncBadge = (() => {
    if (!agent.agentHubId) {
      return { label: 'Solo local', bg: 'rgba(107,114,128,0.15)', color: '#6b7280' };
    }
    if (agent.syncStatus === 'synced') {
      return { label: 'Sync OK', bg: 'rgba(34,197,94,0.12)', color: '#22c55e' };
    }
    if (agent.syncStatus === 'failed') {
      return { label: 'Sync error', bg: 'rgba(239,68,68,0.12)', color: '#ef4444' };
    }
    return { label: 'Sync pendiente', bg: 'rgba(217,119,6,0.12)', color: '#d97706' };
  })();

  const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Settings size={13} /> },
    { id: 'tools',   label: `Herramientas (${tools.length + mcpToolIds.length})`, icon: <Wrench size={13} /> },
    { id: 'rag',     label: `RAG (${ragN})`, icon: <Zap size={13} /> },
    { id: 'subagents', label: `Sub-agentes (${subAgents.length})`, icon: <Network size={13} /> },
  ];

  return (
    <div className="relative overflow-hidden" style={{ minHeight: '100%' }}>
      <div className="hero-glow pointer-events-none" style={{ background: R, top: '-200px', right: '-60px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: B, top: '120px', left: '-120px' }} />

      <div className="relative px-6 py-10 max-w-3xl mx-auto">
      {agent && (
        <>
          <AgentMcpOpenFromQuery
            agentId={id}
            plan={plan}
            readOnly={readOnly}
            onConnected={loadMcp}
            onOpenToolsTab={onOpenToolsTab}
          />
          <AgentHubspotOauthReturn
            agentId={id}
            onOpenToolsTab={onOpenToolsTab}
            onHubspotOauthDone={onHubspotOauthReturn}
          />
        </>
      )}

      {/* Back */}
      <Link href="/dashboard/agents" className="landing-link-accent inline-flex items-center gap-1 text-xs no-underline mb-4 font-semibold">
        <ChevronLeft size={14} /> Mis agentes
      </Link>
      <div className="badge-primary mb-4 w-fit">
        <Sparkles size={13} />
        Detalle del agente
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
          style={{
            background: isDisabled ? 'var(--border)' : `${R}14`,
            borderColor: isDisabled ? 'var(--border)' : `${R}33`,
          }}
        >
          <Bot size={20} style={{ color: isDisabled ? 'var(--muted-foreground)' : R }} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg md:text-xl font-bold tracking-tight">
            <span className="gradient-text">{agent.name}</span>
          </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: isDisabled ? 'rgba(107,114,128,0.15)' : 'rgba(34,197,94,0.12)',
              color: isDisabled ? '#6b7280' : '#22c55e',
            }}>
              {isDisabled ? 'Desactivado' : 'Activo'}
            </span>
            {agent.syncStatus === 'synced' && (
              <span className="text-[10px] font-semibold" style={{ color: B }}>✓ Hub sync</span>
            )}
            {ragSummary && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: ragLoaded ? 'rgba(0,172,248,0.12)' : agent.ragEnabled ? 'rgba(217,119,6,0.12)' : 'rgba(107,114,128,0.12)',
                color: ragLoaded ? B : agent.ragEnabled ? '#d97706' : 'var(--muted-foreground)',
              }} title="Estado del RAG de catálogo (texto, URL, archivos)">
                {ragSummary}
              </span>
            )}
          </div>
          <p className="m-0 text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>{agent.description || agent.model}</p>
        </div>
        {!readOnly && (
        <button
          onClick={toggleStatus}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors card-hover"
          style={{
            borderColor: 'var(--border)',
            background: 'transparent',
            color: isDisabled ? '#22c55e' : '#ef4444',
          }}
        >
          <CircleOff size={13} />
          {isDisabled ? 'Activar' : 'Desactivar'}
        </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-2xl border card-texture" style={{ borderColor: 'var(--border)' }}>
        {TABS.map(({ id: tabId, label, icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            type="button"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border-0 cursor-pointer text-xs transition-all whitespace-nowrap min-w-0"
            style={{
              fontWeight: tab === tabId ? 700 : 500,
              background: tab === tabId ? 'var(--background)' : 'transparent',
              color: tab === tabId ? R : 'var(--muted-foreground)',
              boxShadow: tab === tabId ? `0 0 0 1px ${R}22` : 'none',
            }}
          >
            {icon} <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* Feedback */}
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', marginBottom: '14px' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', fontSize: '13px', marginBottom: '14px' }}>
          ✓ {success}
        </div>
      )}

      {/* ── GENERAL TAB ──────────────────────────────────────────────────────── */}
      {tab === 'general' && (
        <>
          <SectionCard>
            <p style={sectionTitle}>Información básica</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>Nombre</label>
                <input className="landing-input" style={inp} value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>Descripción</label>
                <input className="landing-input" style={inp} value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
              </div>
            </div>
          </SectionCard>

          <SectionCard bar="bo">
            <p style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <KeyRound size={14} style={{ opacity: 0.85 }} /> Token público del widget <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 'normal', color: 'var(--muted-foreground)' }}>(opcional)</span>
            </p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
              Mismo comportamiento que en AgentFlowHub: el SDK usa <code style={{ fontSize: '11px', background: 'var(--background)', padding: '2px 6px', borderRadius: '6px' }}>token</code> y el hub valida <code style={{ fontSize: '11px', background: 'var(--background)', padding: '2px 6px', borderRadius: '6px' }}>X-Widget-Token</code>. Vacío si solo usas tokens <code style={{ fontSize: '11px' }}>wt_…</code> de Mis widgets.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'stretch' }}>
              <input
                style={{ ...inp, flex: '1 1 220px', minWidth: 0 }}
                value={widgetPublicToken}
                onChange={(e) => setWidgetPublicToken(e.target.value)}
                placeholder="Token del catálogo (opcional)"
                autoComplete="off"
                spellCheck={false}
                disabled={readOnly}
              />
              {!readOnly && (
              <button
                type="button"
                onClick={generatePublicToken}
                style={{
                  padding: '10px 14px', borderRadius: '10px', fontWeight: 600, fontSize: '12px',
                  border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                Generar token
              </button>
              )}
            </div>
          </SectionCard>

          <SectionCard>
            <p style={sectionTitle}>Contexto de conversación</p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
              Si está activo, el widget recuerda la última conversación del agente en este navegador, incluso después de refrescar o cerrar sesión.
            </p>
            <div style={{ marginBottom: '12px' }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 20,
                  background: conversationSyncBadge.bg,
                  color: conversationSyncBadge.color,
                }}
                title="Estado de sincronización de esta configuración con AgentFlowHub/AIBackHub"
              >
                {conversationSyncBadge.label}
              </span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: readOnly ? 'default' : 'pointer' }}>
              <div
                onClick={() => !readOnly && setPersistConversationHistory((prev) => !prev)}
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  position: 'relative',
                  cursor: readOnly ? 'not-allowed' : 'pointer',
                  background: persistConversationHistory ? `linear-gradient(90deg, ${R}, ${O})` : 'var(--border)',
                  transition: 'background 0.2s',
                  opacity: readOnly ? 0.75 : 1,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: persistConversationHistory ? 21 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                  }}
                />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                {persistConversationHistory ? 'Memoria persistente activada' : 'Memoria persistente desactivada'}
              </span>
            </label>
          </SectionCard>

          <SectionCard>
            <p style={sectionTitle}>Modelo de IA</p>
            <div data-tour="agent-edit-model">
            {modelsHubError && (
              <p style={{ fontSize: '12px', color: '#d97706', marginBottom: '10px', lineHeight: 1.45 }}>
                {modelsHubError} Se muestran modelos de respaldo.
              </p>
            )}
            {mainModelUnknown && (
              <p style={{ fontSize: '12px', color: '#d97706', marginBottom: '10px', lineHeight: 1.45 }}>
                El modelo guardado (<code style={{ fontSize: '11px' }}>{model}</code>) no está en el catálogo actual o no cumple tu plan. Elige uno de la lista o ajústalo en AgentFlowHub.
              </p>
            )}
            <div style={{ border: '1px solid var(--border)', background: 'var(--muted)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                  Busca por nombre, proveedor o capacidad
                </p>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                  {filteredModels.length} resultados
                </span>
              </div>
              <input
                className="landing-input"
                style={inp}
                value={modelQuery}
                onChange={(e) => {
                  setModelQuery(e.target.value);
                  setShowAllModels(false);
                }}
                placeholder="Buscar modelo..."
                disabled={readOnly}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
              {visibleModels.map((m) => (
                <button key={m.id} type="button" onClick={() => setModel(m.id)} style={{
                  padding: '10px 12px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer',
                  border: `1px solid ${model === m.id ? R : 'var(--border)'}`,
                  background: model === m.id ? 'rgba(228,20,20,0.08)' : 'transparent',
                }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, margin: '0 0 1px', color: model === m.id ? R : 'var(--foreground)' }}>{m.name}</p>
                  <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: 0 }}>
                    {m.provider}{m.badge ? ` · ${m.badge}` : ''}
                    {m.maxTokens != null ? ` · ${m.maxTokens.toLocaleString()} ctx` : ''}
                  </p>
                  {m.description ? (
                    <p style={{ fontSize: '9px', color: 'var(--muted-foreground)', margin: '4px 0 0', lineHeight: 1.35 }}>{m.description}</p>
                  ) : null}
                </button>
              ))}
            </div>
            {filteredModels.length > 12 && (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAllModels((v) => !v)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                  }}
                >
                  {showAllModels ? 'Ver menos modelos' : `Ver todos (${filteredModels.length})`}
                </button>
              </div>
            )}
            <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '6px', color: 'var(--muted-foreground)' }}>
                  Temperatura inferencia (0–2, opcional)
                </label>
                <input
                  style={inp}
                  value={inferenceTemperature}
                  onChange={(e) => setInferenceTemperature(e.target.value)}
                  placeholder="Vacío = catálogo Hub"
                  disabled={readOnly}
                  inputMode="decimal"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '6px', color: 'var(--muted-foreground)' }}>
                  Max tokens salida (opcional)
                </label>
                <input
                  style={inp}
                  value={inferenceMaxTokens}
                  onChange={(e) => setInferenceMaxTokens(e.target.value)}
                  placeholder="Vacío = catálogo Hub"
                  disabled={readOnly}
                  inputMode="numeric"
                />
              </div>
            </div>
            </div>
          </SectionCard>

          <SectionCard bar="bo">
            <p style={sectionTitle}>System Prompt</p>
            <textarea
              className="landing-input"
              style={{ ...inp, minHeight: '160px', resize: 'vertical', fontFamily: 'inherit' }}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={readOnly}
              readOnly={readOnly}
            />
          </SectionCard>

          {!readOnly && (
          <button
            data-tour="agent-edit-save"
            onClick={saveGeneral}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-opacity"
            style={{
              ...BTN_PRIMARY,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar cambios
          </button>
          )}
        </>
      )}

      {/* ── TOOLS TAB ────────────────────────────────────────────────────────── */}
      {tab === 'tools' && (
        <>
          {!readOnly && (
            <div style={{ marginBottom: '16px' }}>
              <McpLandingConnectForm landingAgentId={id} plan={plan} onConnected={loadMcp} />
            </div>
          )}

          {/* ── MCP Integrations (synced) ── */}
          {mcpLoading ? (
            <SectionCard innerStyle={{ textAlign: 'center', padding: '28px 16px' }}>
              <Loader2 size={22} className="animate-spin mx-auto mb-2 block" style={{ color: R }} />
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', margin: 0 }}>Cargando integraciones MCP...</p>
            </SectionCard>
          ) : syncedMcpServers.length > 0 ? (
            <>
              <SectionCard>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <p style={{ ...sectionTitle, margin: 0 }}>Integraciones MCP conectadas</p>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    {mcpToolIds.length} tool{mcpToolIds.length !== 1 ? 's' : ''} activa{mcpToolIds.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '0 0 10px', lineHeight: 1.5 }}>
                  Herramientas de las integraciones MCP conectadas a este agente (desde aquí o desde AgentFlowHub). Cada agente puede usar credenciales distintas para la misma integración.
                </p>
                {!readOnly && (
                  <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '0 0 10px', lineHeight: 1.45 }}>
                    Marca o desmarca las tools y pulsa <strong>Guardar herramientas</strong> (al final de esta pestaña): la selección se guarda aquí y en AIBackHub como{' '}
                    <code style={{ fontSize: '10px' }}>enabledToolIds</code> para el widget y el chat con MCP.
                  </p>
                )}
                {mcpAgentHubLink ? (
                  <div
                    style={{
                      fontSize: '11px',
                      lineHeight: 1.5,
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'rgba(0,172,248,0.06)',
                      marginBottom: '14px',
                      color: 'var(--foreground)',
                    }}
                  >
                    <p style={{ margin: '0 0 6px', fontWeight: 700 }}>Dos niveles de “sync” (no son lo mismo)</p>
                    <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
                      <strong>1) Catálogo AIBackHub</strong> (agente landing ↔ hub):{' '}
                      {mcpAgentHubLink.catalogSyncStatus === 'synced' && mcpAgentHubLink.hasAgentHubId
                        ? (
                          <>
                            OK — id en catálogo:{' '}
                            <code style={{ fontSize: '10px' }}>{mcpAgentHubLink.agentHubId}</code>
                          </>
                          )
                        : mcpAgentHubLink.catalogSyncStatus === 'pending'
                          ? 'pendiente. Espera unos segundos tras crear el agente o ve a Mis agentes y fuerza sincronización.'
                          : mcpAgentHubLink.catalogSyncStatus === 'failed'
                            ? 'falló. Revisa que AIBackHub esté en marcha (BACKEND_URL) y vuelve a sincronizar.'
                            : `estado “${mcpAgentHubLink.catalogSyncStatus}”.`}
                    </p>
                    <p style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>
                      <strong>2) Conexión MCP</strong> (hub ↔ servidor MCP remoto): el distintivo verde en cada tarjeta indica
                      que el hub pudo conectar a tu URL, validar credenciales si aplica y obtener la lista de tools. Las
                      credenciales de la conexión se guardan en el hub y persisten; la fecha de la última comprobación
                      aparece bajo el nombre del servidor.
                    </p>
                  </div>
                ) : null}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {syncedMcpServers.map((srv) => {
                    const MCP_ICONS: Record<string, string> = {
                      gmail: '📧', hubspot: '🏢', slack: '💬',
                      google_calendar: '📅', googleCalendar: '📅',
                      weather: '🌤️', webSearch: '🔍', web_search: '🔍',
                    };
                    const icon = MCP_ICONS[srv.integrationKey] ?? '🔌';
                    const allSelected = srv.tools.every((t) => mcpToolIds.includes(t.id));
                    const someSelected = srv.tools.some((t) => mcpToolIds.includes(t.id));
                    const badge = mcpConnectionBadgeStyle(srv);
                    const lastSyncLabel = formatMcpLastSync(srv.lastSyncAt);

                    return (
                      <div key={srv.connectionId} style={{
                        border: '1px solid var(--border)', borderRadius: '12px',
                        overflow: 'hidden',
                      }}>
                        {/* Server header */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '12px 14px', background: 'rgba(228,20,20,0.04)',
                          borderBottom: '1px solid var(--border)',
                        }}>
                          <span style={{ fontSize: '20px' }}>{icon}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>{srv.serverName}</p>
                            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: 0 }}>
                              {srv.tools.length} tool{srv.tools.length !== 1 ? 's' : ''} disponible{srv.tools.length !== 1 ? 's' : ''}
                              {lastSyncLabel ? ` · última comprobación hub↔MCP: ${lastSyncLabel}` : ''}
                            </p>
                            {srv.syncStatus === 'error' && srv.lastSyncError ? (
                              <p style={{ fontSize: '10px', color: '#ef4444', margin: '4px 0 0', lineHeight: 1.35 }}>
                                {srv.lastSyncError.slice(0, 220)}
                                {srv.lastSyncError.length > 220 ? '…' : ''}
                              </p>
                            ) : null}
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: badge.bg, color: badge.color,
                          }}>
                            {badge.label}
                          </span>
                          {!readOnly && (
                            <>
                              <button
                                type="button"
                                title="Volver a sincronizar con el servidor MCP"
                                onClick={() => resyncMcpConnection(srv.connectionId)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '4px',
                                  fontSize: '11px', fontWeight: 600, padding: '4px 10px',
                                  borderRadius: '6px', border: '1px solid var(--border)',
                                  background: 'transparent', color: 'var(--muted-foreground)',
                                  cursor: 'pointer', whiteSpace: 'nowrap',
                                }}
                              >
                                <RefreshCw size={12} /> Sync
                              </button>
                              <button
                                type="button"
                                title="Quitar conexión de este agente"
                                onClick={() => deleteMcpConnection(srv.connectionId)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '4px',
                                  fontSize: '11px', fontWeight: 600, padding: '4px 10px',
                                  borderRadius: '6px', border: '1px solid rgba(239,68,68,0.35)',
                                  background: 'rgba(239,68,68,0.06)', color: '#ef4444',
                                  cursor: 'pointer', whiteSpace: 'nowrap',
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const ids = srv.tools.map((t) => t.id);
                                  if (allSelected) {
                                    setMcpToolIds((prev) => prev.filter((tid) => !ids.includes(tid)));
                                  } else {
                                    setMcpToolIds((prev) => [...new Set([...prev, ...ids])]);
                                  }
                                }}
                                style={{
                                  fontSize: '11px', fontWeight: 600, padding: '4px 10px',
                                  borderRadius: '6px', border: '1px solid var(--border)',
                                  background: allSelected ? 'rgba(228,20,20,0.08)' : 'transparent',
                                  color: allSelected ? R : 'var(--muted-foreground)',
                                  cursor: 'pointer', whiteSpace: 'nowrap',
                                }}
                              >
                                {allSelected ? 'Deseleccionar todo' : someSelected ? 'Seleccionar todo' : 'Seleccionar todo'}
                              </button>
                            </>
                          )}
                        </div>

                        {/* Tools list */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {srv.tools.map((tool, ti) => {
                            const selected = mcpToolIds.includes(tool.id);
                            return (
                              <button
                                key={tool.id}
                                type="button"
                                onClick={() => !readOnly && toggleMcpTool(tool.id)}
                                disabled={readOnly}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '10px',
                                  padding: '10px 14px', textAlign: 'left',
                                  cursor: readOnly ? 'not-allowed' : 'pointer',
                                  border: 'none',
                                  borderBottom: ti < srv.tools.length - 1 ? '1px solid var(--border)' : 'none',
                                  background: selected ? 'rgba(228,20,20,0.05)' : 'transparent',
                                  transition: 'background 0.15s',
                                }}
                              >
                                <span style={{
                                  width: 18, height: 18, borderRadius: '4px', flexShrink: 0,
                                  border: `2px solid ${selected ? R : 'var(--border)'}`,
                                  background: selected ? R : 'transparent',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  transition: 'all 0.15s',
                                }}>
                                  {selected && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 900, lineHeight: 1 }}>✓</span>}
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{
                                    fontSize: '12px', fontWeight: 600, margin: 0,
                                    color: selected ? R : 'var(--foreground)',
                                  }}>
                                    {tool.name}
                                  </p>
                                  {tool.description && (
                                    <p style={{
                                      fontSize: '11px', color: 'var(--muted-foreground)', margin: '1px 0 0',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                      {tool.description}
                                    </p>
                                  )}
                                </div>
                                <code style={{
                                  fontSize: '9px', color: 'var(--muted-foreground)',
                                  background: 'var(--background)', padding: '2px 6px',
                                  borderRadius: '4px', flexShrink: 0,
                                }}>
                                  {tool.id}
                                </code>
                              </button>
                            );
                          })}
                        </div>
                        {srv.integrationKey === 'mcp_standard' ? (
                          <McpAgentStandardCredentialsEditor
                            landingAgentId={id}
                            connectionId={srv.connectionId}
                            credentialFields={srv.credentialFields}
                            credentialsMask={srv.credentialsMask}
                            readOnly={readOnly}
                            onResync={resyncMcpConnection}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            </>
          ) : mcpServers.length === 0 && !mcpLoading ? (
            <SectionCard innerStyle={{ textAlign: 'center', padding: '28px 16px' }}>
                <RefreshCw size={24} style={{ color: 'var(--muted-foreground)', margin: '0 auto 10px' }} />
                <p style={{ fontWeight: 600, fontSize: '13px', margin: '0 0 6px' }}>Sin integraciones MCP</p>
                <p style={{ color: 'var(--muted-foreground)', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                  Usa el formulario de arriba para conectar Gmail, calendario, MCP estándar, etc. Cada agente puede tener su propia cuenta o credenciales.
                </p>
            </SectionCard>
          ) : null}

          {/* Pending/Error MCP connections */}
          {pendingOrErrorMcpServers.length > 0 && (
            <SectionCard bar="bo">
              <p style={{ ...sectionTitle, margin: '0 0 10px' }}>Integraciones pendientes / con error</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {pendingOrErrorMcpServers.map((srv) => {
                  const pb = mcpConnectionBadgeStyle(srv);
                  const pLast = formatMcpLastSync(srv.lastSyncAt);
                  return (
                  <div
                    key={srv.connectionId}
                    style={{
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      overflow: 'hidden',
                      opacity: 0.9,
                    }}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                    }}>
                      <span style={{ fontSize: '16px' }}>🔌</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, margin: 0 }}>{srv.serverName}</p>
                        {pLast ? (
                          <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: '3px 0 0' }}>
                            Último intento: {pLast}
                          </p>
                        ) : null}
                        {srv.syncStatus === 'error' && srv.lastSyncError ? (
                          <p style={{ fontSize: '10px', color: '#ef4444', margin: '4px 0 0', lineHeight: 1.35 }}>
                            {srv.lastSyncError.slice(0, 280)}
                            {srv.lastSyncError.length > 280 ? '…' : ''}
                          </p>
                        ) : null}
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: pb.bg, color: pb.color,
                      }}>
                        {pb.label}
                      </span>
                      {!readOnly && (
                        <>
                          <button
                            type="button"
                            title="Reintentar sincronización"
                            onClick={() => resyncMcpConnection(srv.connectionId)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px',
                              fontSize: '11px', fontWeight: 600, padding: '4px 10px',
                              borderRadius: '6px', border: '1px solid var(--border)',
                              background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)',
                            }}
                          >
                            <RefreshCw size={12} /> Reintentar
                          </button>
                          <button
                            type="button"
                            title="Eliminar conexión"
                            onClick={() => deleteMcpConnection(srv.connectionId)}
                            style={{
                              padding: '4px 8px', borderRadius: '6px',
                              border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.06)',
                              color: '#ef4444', cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                    {srv.integrationKey === 'mcp_standard' ? (
                      <McpAgentStandardCredentialsEditor
                        landingAgentId={id}
                        connectionId={srv.connectionId}
                        credentialFields={srv.credentialFields}
                        credentialsMask={srv.credentialsMask}
                        readOnly={readOnly}
                        onResync={resyncMcpConnection}
                      />
                    ) : null}
                  </div>
                );
                })}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '10px 0 0', lineHeight: 1.5 }}>
                Reintenta la sincronización aquí o revisa las credenciales. También puedes gestionar conexiones en AgentFlowHub.
              </p>
            </SectionCard>
          )}

          {/* ── Built-in tools ── */}
          <SectionCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <p style={{ ...sectionTitle, margin: 0 }}>Herramientas built-in</p>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{tools.length}/{limits.toolsPerAgent} seleccionadas</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {TOOLS.map((tool) => {
                const available = limits.availableToolIds.includes(tool.id);
                const selected = tools.some((t) => t.toolId === tool.id);
                const maxed = tools.length >= limits.toolsPerAgent && !selected;
                return (
                  <button key={tool.id} type="button"
                    onClick={() => !readOnly && available && !maxed ? toggleToolSelection(tool.id) : undefined}
                    disabled={readOnly}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                      borderRadius: '10px', textAlign: 'left', cursor: readOnly || !available || maxed ? 'not-allowed' : 'pointer',
                      border: `1px solid ${selected ? R : 'var(--border)'}`,
                      background: selected ? 'rgba(228,20,20,0.07)' : 'transparent',
                      opacity: readOnly || !available || maxed ? 0.45 : 1,
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>{tool.icon}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: selected ? R : 'var(--foreground)' }}>{tool.name}</p>
                      <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: 0 }}>{tool.description}</p>
                    </div>
                    {!available && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}><Lock size={9} /> {tool.minPlan}+</span>}
                    {selected && <span style={{ width: 16, height: 16, borderRadius: '50%', background: R, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: '#fff', fontSize: '9px', fontWeight: 900 }}>✓</span>
                    </span>}
                  </button>
                );
              })}
            </div>
          </SectionCard>

          {/* Config fields for selected tools */}
          {tools.map((t) => {
            const def = TOOL_MAP[t.toolId];
            if (!def?.configFields?.length) return null;
            return (
              <SectionCard key={t.toolId}>
                <p style={sectionTitle}>{def.icon} {def.name} — Configuración</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {def.configFields.map((field) => (
                    <div key={field.key}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                        {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                      </label>
                      <input
                        className="landing-input"
                        style={inp}
                        type={field.key.toLowerCase().includes('token') || field.key.toLowerCase().includes('key') || field.key.toLowerCase().includes('secret') ? 'password' : 'text'}
                        value={(t.config ?? {})[field.key] ?? ''}
                        onChange={(e) => updateToolConfig(t.toolId, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        disabled={readOnly}
                      />
                    </div>
                  ))}
                </div>
              </SectionCard>
            );
          })}

          {!readOnly && (
          <button
            onClick={saveTools}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-opacity"
            style={{
              ...BTN_PRIMARY,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar herramientas
          </button>
          )}
        </>
      )}

      {/* ── RAG TAB ──────────────────────────────────────────────────────────── */}
      {tab === 'rag' && (
        <>
          {!limits.ragEnabled ? (
            <SectionCard innerStyle={{ textAlign: 'center', padding: '36px 20px' }}>
              <Lock size={32} style={{ color: 'var(--muted-foreground)', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 700, marginBottom: '6px' }}>RAG no disponible en tu plan</p>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '16px' }}>
                Activa un plan Starter o superior para agregar conocimiento personalizado a tus agentes.
              </p>
              <Link href="/dashboard" className="landing-btn-primary !inline-flex !w-auto no-underline text-sm px-5 py-2 rounded-xl">
                Ver planes →
              </Link>
            </SectionCard>
          ) : (
            <>
              {/* Toggle + description */}
              <SectionCard>
                <p style={sectionTitle}>RAG — Base de conocimiento</p>
                <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginBottom: '16px' }}>
                  Sube archivos o agrega texto/URLs para que el agente responda con información precisa de tu negocio.
                  Soporta PDF, Word, imágenes (OCR automático), TXT, CSV, JSON y más.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: readOnly ? 'default' : 'pointer' }}>
                  <div onClick={() => !readOnly && setRagEnabled(!ragEnabled)} style={{
                    width: 40, height: 22, borderRadius: 11, position: 'relative', cursor: readOnly ? 'not-allowed' : 'pointer',
                    background: ragEnabled ? `linear-gradient(90deg, ${R}, ${O})` : 'var(--border)', transition: 'background 0.2s',
                    opacity: readOnly ? 0.75 : 1,
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: ragEnabled ? 21 : 3,
                      width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                    }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>
                    {ragEnabled ? 'RAG activado' : 'RAG desactivado'}
                  </span>
                </label>
                {ragEnabled && !readOnly && (
                  <button
                    onClick={saveRag}
                    disabled={saving}
                    className="mt-3.5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-opacity"
                    style={{
                      ...BTN_PRIMARY,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Guardar
                  </button>
                )}
              </SectionCard>

              {ragEnabled && (
                <>
                  {/* Upload zone */}
                  <SectionCard bar="bo">
                    <p style={sectionTitle}>Subir archivos</p>

                    {/* Drag-and-drop zone */}
                    <div
                      onDragOver={(e) => { if (!readOnly) { e.preventDefault(); setDragOver(true); } }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={readOnly ? undefined : handleFileDrop}
                      style={{
                        border: `2px dashed ${dragOver ? R : 'var(--border)'}`,
                        borderRadius: '12px', padding: '32px 20px', textAlign: 'center',
                        background: dragOver ? 'rgba(228,20,20,0.05)' : 'transparent',
                        transition: 'all 0.15s', cursor: readOnly ? 'not-allowed' : 'pointer', marginBottom: '14px',
                        pointerEvents: readOnly ? 'none' : 'auto', opacity: readOnly ? 0.65 : 1,
                      }}
                      onClick={() => !readOnly && document.getElementById('rag-file-input')?.click()}
                    >
                      <input
                        id="rag-file-input"
                        type="file"
                        style={{ display: 'none' }}
                        accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif"
                        onChange={handleFileInput}
                      />
                      {uploadingFile ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <Loader2 size={28} className="animate-spin" style={{ color: R }} />
                          <p style={{ color: R, fontSize: '13px', fontWeight: 600 }}>Procesando archivo...</p>
                        </div>
                      ) : (
                        <>
                          <Upload size={28} style={{ color: dragOver ? R : 'var(--muted-foreground)', margin: '0 auto 10px' }} />
                          <p style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>
                            Arrastra un archivo aquí o haz clic para seleccionar
                          </p>
                          <p style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                            PDF · DOCX · TXT · CSV · JSON · PNG · JPG · WEBP — máx. 10 MB
                          </p>
                        </>
                      )}
                    </div>

                    {/* Format pills */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      {[
                        { icon: '📄', label: 'PDF' },
                        { icon: '📝', label: 'DOCX' },
                        { icon: '📊', label: 'CSV' },
                        { icon: '🖼️', label: 'Imágenes (OCR)' },
                        { icon: '📋', label: 'TXT / JSON' },
                      ].map((f) => (
                        <span key={f.label} style={{
                          fontSize: '11px', padding: '3px 10px', borderRadius: '20px',
                          background: 'var(--border)', color: 'var(--muted-foreground)', fontWeight: 600,
                        }}>
                          {f.icon} {f.label}
                        </span>
                      ))}
                    </div>

                    {/* Upload feedback */}
                    {uploadMsg && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', fontSize: '12px' }}>
                        <CheckCircle2 size={14} /> {uploadMsg}
                      </div>
                    )}
                    {uploadErr && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '12px' }}>
                        <AlertCircle size={14} /> {uploadErr}
                        <button onClick={() => setUploadErr('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><X size={12} /></button>
                      </div>
                    )}
                  </SectionCard>

                  {/* Sources list */}
                  <SectionCard>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <p style={{ ...sectionTitle, margin: 0 }}>
                        Fuentes ({ragSources.length}/20)
                      </p>
                      <button onClick={addRagSource} style={{
                        display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px',
                        borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent',
                        fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                      }}>
                        <Plus size={12} /> Agregar texto/URL
                      </button>
                    </div>

                    {ragSources.length === 0 ? (
                      <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
                        Sin fuentes aún. Sube un archivo o agrega texto/URL.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {ragSources.map((src, i) => {
                          if (src.type === 'file') {
                            // File source — read-only display
                            const catIcon: Record<string, ReactNode> = {
                              pdf: <FileText size={16} style={{ color: '#ef4444' }} />,
                              docx: <FileText size={16} style={{ color: R }} />,
                              image: <ImageIcon size={16} style={{ color: '#f59e0b' }} />,
                              text: <AlignLeft size={16} style={{ color: B }} />,
                            };
                            return (
                              <div key={src.fileId ?? i} style={{
                                display: 'flex', alignItems: 'flex-start', gap: '10px',
                                padding: '12px 14px', border: '1px solid var(--border)', borderRadius: '10px',
                                background: 'rgba(228,20,20,0.03)',
                              }}>
                                <div style={{ flexShrink: 0, marginTop: 2 }}>
                                  {catIcon[src.fileCategory ?? ''] ?? <File size={16} style={{ color: 'var(--muted-foreground)' }} />}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontWeight: 700, fontSize: '13px', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {src.fileName ?? src.name}
                                  </p>
                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                                    {src.fileSize && <span>{(src.fileSize / 1024).toFixed(1)} KB</span>}
                                    {src.charCount ? <span>{src.charCount.toLocaleString()} chars extraídos</span> : null}
                                    {src.uploadedAt && <span>{new Date(src.uploadedAt).toLocaleDateString('es')}</span>}
                                  </div>
                                  {src.warning && (
                                    <p style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <AlertCircle size={10} /> {src.warning}
                                    </p>
                                  )}
                                </div>
                                {!readOnly && (
                                <button onClick={() => deleteRagSource(src, i)} style={{
                                  flexShrink: 0, padding: '5px', borderRadius: '6px',
                                  border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)',
                                  color: '#ef4444', cursor: 'pointer',
                                }}>
                                  <Trash2 size={12} />
                                </button>
                                )}
                              </div>
                            );
                          }

                          // Manual text / URL source — editable
                          return (
                            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                                {src.type === 'url'
                                  ? <Link2 size={14} style={{ color: R, flexShrink: 0 }} />
                                  : <AlignLeft size={14} style={{ color: B, flexShrink: 0 }} />
                                }
                                <select
                                  value={src.type}
                                  onChange={(e) => setRagSources((prev) => prev.map((s, idx) => idx === i ? { ...s, type: e.target.value as 'url' | 'text' } : s))}
                                  style={{ ...inp, width: 'auto', padding: '4px 8px', fontSize: '12px' }}
                                  disabled={readOnly}
                                >
                                  <option value="text">Texto</option>
                                  <option value="url">URL</option>
                                </select>
                                <input
                                  style={{ ...inp, flex: 1, fontSize: '12px', padding: '6px 10px' }}
                                  value={src.name}
                                  onChange={(e) => setRagSources((prev) => prev.map((s, idx) => idx === i ? { ...s, name: e.target.value } : s))}
                                  placeholder="Nombre (ej: FAQ empresa)"
                                  disabled={readOnly}
                                />
                                {!readOnly && (
                                <button onClick={() => deleteRagSource(src, i)} style={{
                                  padding: '5px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)',
                                  background: 'rgba(239,68,68,0.06)', color: '#ef4444', cursor: 'pointer', flexShrink: 0,
                                }}>
                                  <Trash2 size={12} />
                                </button>
                                )}
                              </div>
                              {src.type === 'url' ? (
                                <input
                                  style={inp}
                                  value={src.content}
                                  onChange={(e) => setRagSources((prev) => prev.map((s, idx) => idx === i ? { ...s, content: e.target.value } : s))}
                                  placeholder="https://tu-sitio.com/faq"
                                  disabled={readOnly}
                                  readOnly={readOnly}
                                />
                              ) : (
                                <textarea
                                  style={{ ...inp, minHeight: '90px', resize: 'vertical', fontFamily: 'inherit', fontSize: '12px' }}
                                  value={src.content}
                                  onChange={(e) => setRagSources((prev) => prev.map((s, idx) => idx === i ? { ...s, content: e.target.value } : s))}
                                  placeholder="Pega aquí texto de conocimiento: FAQ, políticas, catálogo de productos..."
                                  disabled={readOnly}
                                  readOnly={readOnly}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Save button for manual text/url sources */}
                    {!readOnly && ragSources.some((s) => s.type !== 'file') && (
                      <button
                        onClick={saveRag}
                        disabled={saving}
                        className="mt-3.5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-opacity"
                        style={{
                          ...BTN_PRIMARY,
                          cursor: saving ? 'not-allowed' : 'pointer',
                          opacity: saving ? 0.7 : 1,
                        }}
                      >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        Guardar fuentes de texto/URL
                      </button>
                    )}
                  </SectionCard>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ── SUB-AGENTS TAB ───────────────────────────────────────────────────── */}
      {tab === 'subagents' && (
        <>
          {limits.subAgentsPerAgent === 0 ? (
            <SectionCard innerStyle={{ textAlign: 'center', padding: '36px 20px' }}>
              <Network size={32} style={{ color: 'var(--muted-foreground)', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 700, marginBottom: '6px' }}>Sub-agentes no disponibles en tu plan</p>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '16px' }}>
                Los sub-agentes permiten orquestar múltiples especialistas bajo un agente principal. Disponible desde el plan Starter.
              </p>
              <Link href="/dashboard" className="landing-btn-primary !inline-flex !w-auto no-underline text-sm px-5 py-2 rounded-xl">
                Ver planes →
              </Link>
            </SectionCard>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <p className="font-bold m-0 mb-0.5">Orquestación y sub-agentes</p>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '12px', margin: 0 }}>
                    {subAgents.length}/{limits.subAgentsPerAgent} sub-agentes
                  </p>
                </div>
                {subAgents.length < limits.subAgentsPerAgent && !showNewSub && (
                  <button
                    type="button"
                    onClick={() => setShowNewSub(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-opacity"
                    style={{ ...BTN_PRIMARY, cursor: 'pointer' }}
                  >
                    <Plus size={13} /> Agregar sub-agente
                  </button>
                )}
              </div>

              {showNewSub && !readOnly && (
                <SectionCard outerStyle={{ borderColor: 'rgba(228,20,20,0.35)' }}>
                  <p style={sectionTitle}>Nuevo sub-agente</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input className="landing-input" style={inp} value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="Nombre del sub-agente (ej: Especialista en facturación)" />
                    <select className="landing-input" style={inp} value={subModel} onChange={(e) => setSubModel(e.target.value)}>
                      {displayModels.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
                    </select>
                    <textarea
                      className="landing-input"
                      style={{ ...inp, minHeight: '100px', resize: 'vertical', fontFamily: 'inherit' }}
                      value={subPrompt}
                      onChange={(e) => setSubPrompt(e.target.value)}
                      placeholder="System prompt del sub-agente: Define su especialización específica..."
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={createSubAgent}
                        disabled={creatingSubAgent || !subName.trim() || !subPrompt.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-opacity"
                        style={{
                          ...BTN_PRIMARY,
                          cursor: 'pointer',
                          opacity: (!subName.trim() || !subPrompt.trim()) ? 0.6 : 1,
                        }}
                      >
                        {creatingSubAgent ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        Crear
                      </button>
                      <button type="button" onClick={() => setShowNewSub(false)} style={{
                        padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)',
                        background: 'transparent', fontSize: '12px', cursor: 'pointer',
                      }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                </SectionCard>
              )}

              {subAgents.length === 0 && !showNewSub ? (
                <SectionCard innerStyle={{ textAlign: 'center', padding: '28px 16px' }}>
                  <Network size={28} style={{ color: 'var(--muted-foreground)', margin: '0 auto 10px' }} />
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', margin: 0 }}>
                    Sin sub-agentes aún. Agrega especialistas para orquestar tareas complejas.
                  </p>
                </SectionCard>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {subAgents.map((sa) => (
                    <div
                      key={sa._id}
                      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border card-texture card-hover"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div
                        className="w-[34px] h-[34px] rounded-lg flex items-center justify-center shrink-0 border"
                        style={{ background: `${R}14`, borderColor: `${R}28` }}
                      >
                        <Bot size={16} style={{ color: R }} strokeWidth={1.75} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '13px' }}>{sa.name}</p>
                        <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted-foreground)' }}>{sa.model}</p>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: sa.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.15)',
                        color: sa.status === 'active' ? '#22c55e' : '#6b7280',
                      }}>
                        {sa.status === 'active' ? 'Activo' : 'Desactivado'}
                      </span>
                      <Link
                        href={`/dashboard/agents/${sa._id}`}
                        className="landing-link-accent no-underline text-[11px] font-semibold px-2.5 py-1.5 rounded-lg shrink-0"
                        style={{ background: `${R}14` }}
                      >
                        Configurar
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
      </div>
    </div>
  );
}
