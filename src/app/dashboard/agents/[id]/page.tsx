'use client';

import { useEffect, useState, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSubscription } from '@/hooks/use-subscription';
import { useClientModels, mergeSavedModelOptions } from '@/hooks/use-client-models';
import { TOOLS, getAgentLimits, TOOL_MAP } from '@/lib/agent-plans';
import {
  Bot, ChevronLeft, Save, Loader2, Plus, Trash2, Network,
  Zap, Wrench, Settings, Lock, CircleOff, Upload, FileText,
  Image as ImageIcon, File, Link2, AlignLeft, CheckCircle2,
  AlertCircle, X, KeyRound,
} from 'lucide-react';
import Link from 'next/link';

type Tab = 'general' | 'tools' | 'rag' | 'subagents';

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
  const [inferenceTemperature, setInferenceTemperature] = useState('');
  const [inferenceMaxTokens, setInferenceMaxTokens] = useState('');

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
        setInferenceTemperature(
          typeof a.inferenceTemperature === 'number' ? String(a.inferenceTemperature) : '',
        );
        setInferenceMaxTokens(
          typeof a.inferenceMaxTokens === 'number' ? String(a.inferenceMaxTokens) : '',
        );
      })
      .finally(() => setLoading(false));
  }, [id, router]);

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
    await save({ tools });
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

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--background)',
    color: 'var(--foreground)', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
  };
  const section: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: '14px', padding: '20px', marginBottom: '16px',
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: '12px', fontWeight: 700, color: 'var(--muted-foreground)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '14px',
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)' }}>Cargando...</div>;
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

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Settings size={13} /> },
    { id: 'tools',   label: `Herramientas (${tools.length})`, icon: <Wrench size={13} /> },
    { id: 'rag',     label: `RAG (${ragN})`, icon: <Zap size={13} /> },
    { id: 'subagents', label: `Sub-agentes (${subAgents.length})`, icon: <Network size={13} /> },
  ];

  return (
    <div style={{ padding: '32px', maxWidth: '750px' }}>
      {/* Back */}
      <Link href="/dashboard/agents" style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        color: 'var(--muted-foreground)', fontSize: '12px', textDecoration: 'none', marginBottom: '18px',
      }}>
        <ChevronLeft size={14} /> Mis agentes
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{
          width: 44, height: 44, borderRadius: '12px',
          background: isDisabled ? 'var(--border)' : 'rgba(99,102,241,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Bot size={20} style={{ color: isDisabled ? 'var(--muted-foreground)' : '#6366f1' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '18px', fontWeight: 800 }}>{agent.name}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: isDisabled ? 'rgba(107,114,128,0.15)' : 'rgba(34,197,94,0.12)',
              color: isDisabled ? '#6b7280' : '#22c55e',
            }}>
              {isDisabled ? 'Desactivado' : 'Activo'}
            </span>
            {agent.syncStatus === 'synced' && (
              <span style={{ fontSize: 10, color: '#0d9488', fontWeight: 600 }}>✓ Hub sync</span>
            )}
            {ragSummary && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: ragLoaded ? 'rgba(13,148,136,0.12)' : agent.ragEnabled ? 'rgba(217,119,6,0.12)' : 'rgba(107,114,128,0.12)',
                color: ragLoaded ? '#0d9488' : agent.ragEnabled ? '#d97706' : 'var(--muted-foreground)',
              }} title="Estado del RAG de catálogo (texto, URL, archivos)">
                {ragSummary}
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted-foreground)' }}>{agent.description || agent.model}</p>
        </div>
        {!readOnly && (
        <button
          onClick={toggleStatus}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'transparent', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
            color: isDisabled ? '#22c55e' : '#ef4444',
          }}
        >
          <CircleOff size={13} />
          {isDisabled ? 'Activar' : 'Desactivar'}
        </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--card)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)' }}>
        {TABS.map(({ id: tabId, label, icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              padding: '7px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: tab === tabId ? 700 : 500,
              background: tab === tabId ? 'var(--background)' : 'transparent',
              color: tab === tabId ? 'var(--foreground)' : 'var(--muted-foreground)',
              whiteSpace: 'nowrap',
            }}
          >
            {icon} {label}
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
          <div style={section}>
            <p style={sectionTitle}>Información básica</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>Nombre</label>
                <input style={inp} value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>Descripción</label>
                <input style={inp} value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
              </div>
            </div>
          </div>

          <div style={section}>
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
          </div>

          <div style={section}>
            <p style={sectionTitle}>Modelo de IA</p>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '6px' }}>
              {displayModels.map((m) => (
                <button key={m.id} type="button" onClick={() => setModel(m.id)} style={{
                  padding: '8px 10px', borderRadius: '8px', textAlign: 'left', cursor: 'pointer',
                  border: `1px solid ${model === m.id ? '#6366f1' : 'var(--border)'}`,
                  background: model === m.id ? 'rgba(99,102,241,0.08)' : 'transparent',
                }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, margin: '0 0 1px', color: model === m.id ? '#6366f1' : 'var(--foreground)' }}>{m.name}</p>
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

          <div style={section}>
            <p style={sectionTitle}>System Prompt</p>
            <textarea
              style={{ ...inp, minHeight: '160px', resize: 'vertical', fontFamily: 'inherit' }}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={readOnly}
              readOnly={readOnly}
            />
          </div>

          {!readOnly && (
          <button
            onClick={saveGeneral}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 22px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
              background: '#6366f1', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={14} />}
            Guardar cambios
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </button>
          )}
        </>
      )}

      {/* ── TOOLS TAB ────────────────────────────────────────────────────────── */}
      {tab === 'tools' && (
        <>
          <div style={{ ...section, marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <p style={{ ...sectionTitle, margin: 0 }}>Herramientas disponibles</p>
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
                      border: `1px solid ${selected ? '#6366f1' : 'var(--border)'}`,
                      background: selected ? 'rgba(99,102,241,0.07)' : 'transparent',
                      opacity: readOnly || !available || maxed ? 0.45 : 1,
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>{tool.icon}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: selected ? '#6366f1' : 'var(--foreground)' }}>{tool.name}</p>
                      <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: 0 }}>{tool.description}</p>
                    </div>
                    {!available && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}><Lock size={9} /> {tool.minPlan}+</span>}
                    {selected && <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: '#fff', fontSize: '9px', fontWeight: 900 }}>✓</span>
                    </span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Config fields for selected tools */}
          {tools.map((t) => {
            const def = TOOL_MAP[t.toolId];
            if (!def?.configFields?.length) return null;
            return (
              <div key={t.toolId} style={section}>
                <p style={sectionTitle}>{def.icon} {def.name} — Configuración</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {def.configFields.map((field) => (
                    <div key={field.key}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                        {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                      </label>
                      <input
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
              </div>
            );
          })}

          {!readOnly && (
          <button onClick={saveTools} disabled={saving} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 22px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
            background: '#6366f1', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={14} />}
            Guardar herramientas
          </button>
          )}
        </>
      )}

      {/* ── RAG TAB ──────────────────────────────────────────────────────────── */}
      {tab === 'rag' && (
        <>
          {!limits.ragEnabled ? (
            <div style={{ ...section, textAlign: 'center', padding: '40px' }}>
              <Lock size={32} style={{ color: 'var(--muted-foreground)', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 700, marginBottom: '6px' }}>RAG no disponible en tu plan</p>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '16px' }}>
                Activa un plan Starter o superior para agregar conocimiento personalizado a tus agentes.
              </p>
              <Link href="/dashboard" style={{
                display: 'inline-flex', padding: '8px 20px', borderRadius: '10px',
                fontWeight: 700, fontSize: '13px', background: '#6366f1', color: '#fff', textDecoration: 'none',
              }}>Ver planes →</Link>
            </div>
          ) : (
            <>
              {/* Toggle + description */}
              <div style={section}>
                <p style={sectionTitle}>RAG — Base de conocimiento</p>
                <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginBottom: '16px' }}>
                  Sube archivos o agrega texto/URLs para que el agente responda con información precisa de tu negocio.
                  Soporta PDF, Word, imágenes (OCR automático), TXT, CSV, JSON y más.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: readOnly ? 'default' : 'pointer' }}>
                  <div onClick={() => !readOnly && setRagEnabled(!ragEnabled)} style={{
                    width: 40, height: 22, borderRadius: 11, position: 'relative', cursor: readOnly ? 'not-allowed' : 'pointer',
                    background: ragEnabled ? '#6366f1' : 'var(--border)', transition: 'background 0.2s',
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
                  <button onClick={saveRag} disabled={saving} style={{
                    marginTop: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '7px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '12px',
                    background: '#6366f1', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                  }}>
                    {saving ? <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={13} />}
                    Guardar
                  </button>
                )}
              </div>

              {ragEnabled && (
                <>
                  {/* Upload zone */}
                  <div style={section}>
                    <p style={sectionTitle}>Subir archivos</p>

                    {/* Drag-and-drop zone */}
                    <div
                      onDragOver={(e) => { if (!readOnly) { e.preventDefault(); setDragOver(true); } }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={readOnly ? undefined : handleFileDrop}
                      style={{
                        border: `2px dashed ${dragOver ? '#6366f1' : 'var(--border)'}`,
                        borderRadius: '12px', padding: '32px 20px', textAlign: 'center',
                        background: dragOver ? 'rgba(99,102,241,0.05)' : 'transparent',
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
                          <Loader2 size={28} style={{ color: '#6366f1', animation: 'spin 0.7s linear infinite' }} />
                          <p style={{ color: '#6366f1', fontSize: '13px', fontWeight: 600 }}>Procesando archivo...</p>
                        </div>
                      ) : (
                        <>
                          <Upload size={28} style={{ color: dragOver ? '#6366f1' : 'var(--muted-foreground)', margin: '0 auto 10px' }} />
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
                  </div>

                  {/* Sources list */}
                  <div style={section}>
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
                            const catIcon: Record<string, React.ReactNode> = {
                              pdf: <FileText size={16} style={{ color: '#ef4444' }} />,
                              docx: <FileText size={16} style={{ color: '#6366f1' }} />,
                              image: <ImageIcon size={16} style={{ color: '#f59e0b' }} />,
                              text: <AlignLeft size={16} style={{ color: '#0d9488' }} />,
                            };
                            return (
                              <div key={src.fileId ?? i} style={{
                                display: 'flex', alignItems: 'flex-start', gap: '10px',
                                padding: '12px 14px', border: '1px solid var(--border)', borderRadius: '10px',
                                background: 'rgba(99,102,241,0.03)',
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
                                  ? <Link2 size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                                  : <AlignLeft size={14} style={{ color: '#0d9488', flexShrink: 0 }} />
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
                      <button onClick={saveRag} disabled={saving} style={{
                        marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '9px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                        background: '#6366f1', color: '#fff', border: 'none',
                        cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                      }}>
                        {saving ? <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={13} />}
                        Guardar fuentes de texto/URL
                      </button>
                    )}
                  </div>
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
            <div style={{ ...section, textAlign: 'center', padding: '40px' }}>
              <Network size={32} style={{ color: 'var(--muted-foreground)', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 700, marginBottom: '6px' }}>Sub-agentes no disponibles en tu plan</p>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '16px' }}>
                Los sub-agentes permiten orquestar múltiples especialistas bajo un agente principal. Disponible desde el plan Starter.
              </p>
              <Link href="/dashboard" style={{
                display: 'inline-flex', padding: '8px 20px', borderRadius: '10px',
                fontWeight: 700, fontSize: '13px', background: '#6366f1', color: '#fff', textDecoration: 'none',
              }}>Ver planes →</Link>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <p style={{ fontWeight: 700, margin: '0 0 2px' }}>Orquestación y sub-agentes</p>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '12px', margin: 0 }}>
                    {subAgents.length}/{limits.subAgentsPerAgent} sub-agentes
                  </p>
                </div>
                {subAgents.length < limits.subAgentsPerAgent && !showNewSub && (
                  <button onClick={() => setShowNewSub(true)} style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                    borderRadius: '10px', border: 'none', background: '#6366f1', color: '#fff',
                    fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                  }}>
                    <Plus size={13} /> Agregar sub-agente
                  </button>
                )}
              </div>

              {showNewSub && !readOnly && (
                <div style={{ ...section, border: '1px solid rgba(99,102,241,0.3)' }}>
                  <p style={sectionTitle}>Nuevo sub-agente</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input style={inp} value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="Nombre del sub-agente (ej: Especialista en facturación)" />
                    <select style={inp} value={subModel} onChange={(e) => setSubModel(e.target.value)}>
                      {displayModels.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
                    </select>
                    <textarea
                      style={{ ...inp, minHeight: '100px', resize: 'vertical', fontFamily: 'inherit' }}
                      value={subPrompt}
                      onChange={(e) => setSubPrompt(e.target.value)}
                      placeholder="System prompt del sub-agente: Define su especialización específica..."
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={createSubAgent} disabled={creatingSubAgent || !subName.trim() || !subPrompt.trim()} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px',
                        borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff',
                        fontWeight: 700, fontSize: '12px', cursor: 'pointer', opacity: (!subName.trim() || !subPrompt.trim()) ? 0.6 : 1,
                      }}>
                        {creatingSubAgent ? <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Plus size={13} />}
                        Crear
                      </button>
                      <button onClick={() => setShowNewSub(false)} style={{
                        padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)',
                        background: 'transparent', fontSize: '12px', cursor: 'pointer',
                      }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {subAgents.length === 0 && !showNewSub ? (
                <div style={{ ...section, textAlign: 'center', padding: '32px' }}>
                  <Network size={28} style={{ color: 'var(--muted-foreground)', margin: '0 auto 10px' }} />
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '13px' }}>
                    Sin sub-agentes aún. Agrega especialistas para orquestar tareas complejas.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {subAgents.map((sa) => (
                    <div key={sa._id} style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px',
                      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px',
                    }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '8px', background: 'rgba(99,102,241,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Bot size={16} style={{ color: '#6366f1' }} />
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
                      <Link href={`/dashboard/agents/${sa._id}`} style={{
                        padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        color: '#6366f1', background: 'rgba(99,102,241,0.08)', textDecoration: 'none',
                      }}>
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
  );
}
