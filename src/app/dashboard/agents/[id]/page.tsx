'use client';

import {
  useEffect, useState, use, useMemo, useCallback, useRef,
  type CSSProperties, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSubscription } from '@/hooks/use-subscription';
import { useClientModels, mergeSavedModelOptions } from '@/hooks/use-client-models';
import { TOOLS, getAgentLimits, TOOL_MAP } from '@/lib/agent-plans';
import { AGENT_SKILLS } from '@/lib/agent-skills';
import {
  Bot, ChevronLeft, Save, Loader2, Plus, Trash2, Network,
  Zap, Wrench, Settings, Lock, CircleOff, Upload, FileText,
  Image as ImageIcon, File, Link2, AlignLeft, CheckCircle2,
  AlertCircle, X, KeyRound, RefreshCw, Sparkles, HelpCircle,
  Copy, Eye, Search, Volume2, Play, Square,
} from 'lucide-react';
import {
  stripManagedFaqPrompt,
  buildFaqPromptBlock,
  type AgentFaqRow,
  type FaqCandidateRow,
} from '@/lib/agent-faq-utils';
import Link from 'next/link';
import { McpLandingConnectForm } from '@/components/mcp/mcp-landing-connect-form';
import { AIInputButton } from '@/components/ui/AIInputButton';
import { AgentMcpOpenFromQuery } from '@/components/mcp/agent-mcp-open-from-query';
import { AgentHubspotOauthReturn } from '@/components/mcp/agent-hubspot-oauth-return';

const R = '#e41414';
const O = '#f87600';
const B = '#00acf8';
const RUNTIME_SKILL_TEMPLATES = [
  {
    id: 'sales_closer',
    name: 'Cierre de Ventas Consultivo',
    defaultPriority: 50,
    icon: '💼',
    description: 'Enfoca la conversación en detección de necesidad, objeciones y cierre.',
  },
  {
    id: 'tech_support_l1',
    name: 'Soporte Técnico Nivel 1',
    defaultPriority: 40,
    icon: '🛠️',
    description: 'Diagnóstico paso a paso, tono empático y escalamiento cuando falta contexto.',
  },
  {
    id: 'data_analyst_pro',
    name: 'Analista de Datos Pro',
    defaultPriority: 45,
    icon: '📊',
    description: 'Razonamiento estructurado para métricas, tablas y detección de anomalías.',
  },
] as const;
const BTN_PRIMARY: CSSProperties = {
  background: `linear-gradient(135deg, ${R}, ${O})`,
  color: '#fff',
  border: 'none',
  boxShadow: '0 4px 18px rgba(228,20,20,0.28)',
};

/** Plantillas servidas desde `public/assets/exampleRAG` (generar con `npm run gen:rag-examples`). */
const RAG_EXAMPLE_BASE = '/assets/exampleRAG';

function triggerRagExampleDownload(file: string) {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = `${RAG_EXAMPLE_BASE}/${file}`;
  a.download = file;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const RAG_EXAMPLE_DOWNLOADS = [
  { icon: '📄', label: 'PDF', file: 'ejemplo-rag.pdf' },
  { icon: '📝', label: 'DOCX', file: 'ejemplo-rag.docx' },
  { icon: '📊', label: 'CSV', file: 'ejemplo-rag.csv' },
  { icon: '🖼️', label: 'Imagen (OCR)', file: 'ejemplo-rag-ocr.png' },
  { icon: '📋', label: 'TXT', file: 'ejemplo-rag.txt' },
  { icon: '📑', label: 'JSON', file: 'ejemplo-rag.json' },
] as const;

/** Alineado con `rag-processor` (truncado al indexar). */
const RAG_MAX_EXTRACTED_CHARS = 120_000;
const RAG_MAX_FILE_MB = 10;

type Tab = 'general' | 'rules' | 'faqs' | 'tools' | 'rag' | 'subagents' | 'voice';

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

const MCP_INTEGRATION_ICONS: Record<string, string> = {
  gmail: '📧',
  hubspot: '🏢',
  slack: '💬',
  google_calendar: '📅',
  googleCalendar: '📅',
  weather: '🌤️',
  webSearch: '🔍',
  web_search: '🔍',
  mongodb: '🍃',
  postgres: '🐘',
  mcp_standard: '🔌',
};

function mcpIntegrationIcon(integrationKey: string): string {
  return MCP_INTEGRATION_ICONS[integrationKey] ?? '🔌';
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
interface ScrapeBlock {
  title: string;
  content: string;
  type: string;
  order: number;
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
  widgetVoiceName?: string | null;
  persistConversationHistory?: boolean;
  strictPurposeOnly?: boolean;
  enabledMcpToolIds?: string[];
  hubspotAutoCaptureContacts?: boolean;
  /** Catálogo global (solo lectura en la landing; edición en AgentFlowHub). */
  isPlatform?: boolean;
  /** Skills del agente (IDs del catálogo). Sync con hub. */
  skills?: string[];
  /** Config runtime de skills (prompt/tools/settings). */
  skillsConfig?: Array<{
    id: string;
    name?: string;
    enabled?: boolean;
    priority?: number;
    config?: {
      prompt_extension?: string;
      active_tools?: string[];
      llm_settings?: {
        temperature?: number;
        maxOutputTokens?: number;
      };
    };
  }>;
  behaviorRules?: BehaviorRule[];
  agentFaqs?: AgentFaqRow[];
  faqCandidates?: FaqCandidateRow[];
}
interface SubAgent {
  _id: string; name: string; model: string; status: 'active' | 'disabled';
  tools: ToolConfig[];
}

interface BehaviorRule {
  id: string;
  title: string;
  enabled: boolean;
  priority: number;
  category: string;
  tone: string;
  shortAnswers: boolean;
  complaintPolicy: string;
  unknownAnswerPolicy: string;
  interpretedRule: string;
  notes: string;
}

const RULES_PROMPT_START = '### [AFHUB_RULES_START]';
const RULES_PROMPT_END = '### [AFHUB_RULES_END]';

function createEmptyRule(): BehaviorRule {
  return {
    id: crypto.randomUUID(),
    title: 'Nueva regla',
    enabled: true,
    priority: 100,
    category: 'general',
    tone: 'profesional',
    shortAnswers: false,
    complaintPolicy: '',
    unknownAnswerPolicy: '',
    interpretedRule: '',
    notes: '',
  };
}

function stripManagedRulesPrompt(raw: string): string {
  const s = raw || '';
  const start = s.indexOf(RULES_PROMPT_START);
  const end = s.indexOf(RULES_PROMPT_END);
  if (start === -1 || end === -1 || end < start) return s.trim();
  const before = s.slice(0, start).trimEnd();
  const after = s.slice(end + RULES_PROMPT_END.length).trimStart();
  return [before, after].filter(Boolean).join('\n\n').trim();
}

function buildRulesPrompt(rules: BehaviorRule[]): string {
  const active = rules
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);
  if (active.length === 0) return '';
  const lines = active.map((r, idx) => {
    const extras: string[] = [];
    extras.push(`categoria=${r.category}`);
    extras.push(`tono=${r.tone}`);
    if (r.shortAnswers) extras.push('respuesta_corta=si');
    if (r.complaintPolicy.trim()) extras.push(`quejas=${r.complaintPolicy.trim()}`);
    if (r.unknownAnswerPolicy.trim()) extras.push(`si_no_sabe=${r.unknownAnswerPolicy.trim()}`);
    const body = r.interpretedRule.trim() || r.notes.trim() || 'Aplicar esta regla de forma consistente.';
    return `${idx + 1}. ${r.title.trim()} [${extras.join(' | ')}]\n   - ${body}`;
  });
  return `${RULES_PROMPT_START}
Reglas operativas configuradas por el cliente (aplícalas de mayor prioridad a menor prioridad):
${lines.join('\n')}
${RULES_PROMPT_END}`;
}

function mergeSystemPromptWithManagedBlocks(
  basePrompt: string,
  rules: BehaviorRule[],
  faqs: AgentFaqRow[],
  candidates: FaqCandidateRow[],
): string {
  const base = stripManagedFaqPrompt(stripManagedRulesPrompt(basePrompt));
  const rulesBlock = buildRulesPrompt(rules);
  const faqBlock = buildFaqPromptBlock(faqs, candidates);
  return [base, rulesBlock, faqBlock].filter(Boolean).join('\n\n').trim();
}

function createEmptyFaq(): AgentFaqRow {
  return {
    id: crypto.randomUUID(),
    question: '',
    answer: '',
    enabled: true,
    priority: 100,
  };
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

  // ── AI Suggestions ────────────────────────────────────────────────────────
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{
    systemPrompt: string;
    faqs: Array<{ question: string; answer: string }>;
    rules: Array<{ title: string; description: string }>;
  } | null>(null);
  const [suggestFaqsAdded, setSuggestFaqsAdded] = useState<Set<number>>(new Set());
  const [suggestRulesAdded, setSuggestRulesAdded] = useState<Set<number>>(new Set());

  async function handleSuggestAgent() {
    if (!name.trim()) return;
    setAiSuggesting(true);
    setAiSuggestions(null);
    setSuggestFaqsAdded(new Set());
    setSuggestRulesAdded(new Set());
    try {
      const resp = await fetch('/api/ai/suggest-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName: name.trim(), agentPurpose: description.trim() || name.trim() }),
      });
      const json = await resp.json() as { success?: boolean; data?: typeof aiSuggestions; error?: string };
      if (!resp.ok || !json.success) throw new Error(json.error ?? 'Error al generar sugerencias');
      setAiSuggestions(json.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar sugerencias');
    } finally {
      setAiSuggesting(false);
    }
  }

  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState('');
  const [tools, setTools] = useState<ToolConfig[]>([]);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragSources, setRagSources] = useState<RagSource[]>([]);
  const ragSourcesRef = useRef<RagSource[]>([]);
  useEffect(() => {
    ragSourcesRef.current = ragSources;
  }, [ragSources]);
  const [widgetPublicToken, setWidgetPublicToken] = useState('');
  const [widgetVoiceName, setWidgetVoiceName] = useState<string>('');
  const [persistConversationHistory, setPersistConversationHistory] = useState(true);
  const [strictPurposeOnly, setStrictPurposeOnly] = useState(true);
  const [inferenceTemperature, setInferenceTemperature] = useState('');
  const [inferenceMaxTokens, setInferenceMaxTokens] = useState('');
  const [modelQuery, setModelQuery] = useState('');
  const [showAllModels, setShowAllModels] = useState(false);
  const [modelCatFilter, setModelCatFilter] = useState<string>('all');
  const [modelTierFilter, setModelTierFilter] = useState<string>('all');
  const [fallbackModels, setFallbackModels] = useState<string[]>([]);
  const [showFallbackPanel, setShowFallbackPanel] = useState(false);
  const [fallbackQuery, setFallbackQuery] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillsConfig, setSkillsConfig] = useState<NonNullable<ClientAgent['skillsConfig']>>([]);
  const [behaviorRules, setBehaviorRules] = useState<BehaviorRule[]>([]);
  const [agentFaqs, setAgentFaqs] = useState<AgentFaqRow[]>([]);
  const [faqCandidates, setFaqCandidates] = useState<FaqCandidateRow[]>([]);
  const [customSkillInput, setCustomSkillInput] = useState('');

  // MCP tools state
  const [mcpServers, setMcpServers] = useState<McpServerGroup[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpToolIds, setMcpToolIds] = useState<string[]>([]);
  const [hubspotAutoCaptureContacts, setHubspotAutoCaptureContacts] = useState(false);
  const [mcpAgentHubLink, setMcpAgentHubLink] = useState<AgentHubLinkInfo | null>(null);
  const enabledMcpSavedRef = useRef<string[] | undefined>(undefined);
  useEffect(() => {
    enabledMcpSavedRef.current = agent?.enabledMcpToolIds;
  }, [agent?.enabledMcpToolIds]);

  // File upload state
  const [dragOver, setDragOver] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploadErr, setUploadErr] = useState('');
  const [webhookTestBusy, setWebhookTestBusy] = useState(false);
  /** Cola de subida: null = inactivo. */
  const [ragUploadProgress, setRagUploadProgress] = useState<null | { current: number; total: number; fileName: string }>(null);
  const [ragPreview, setRagPreview] = useState<null | { title: string; snippet: string; totalChars: number }>(null);
  const [ragSourceQuery, setRagSourceQuery] = useState('');
  const [ragSourceSort, setRagSourceSort] = useState<'order' | 'name' | 'size' | 'chars'>('order');
  const [ragRetryHubBusy, setRagRetryHubBusy] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeStatus, setScrapeStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [scrapeStep, setScrapeStep] = useState('');
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [scrapeBlocks, setScrapeBlocks] = useState<ScrapeBlock[] | null>(null);
  const [scrapeError, setScrapeError] = useState('');
  const [scrapeTitle, setScrapeTitle] = useState('');
  const [scrapeExtractedBy, setScrapeExtractedBy] = useState<'ai' | 'chunk' | null>(null);
  const [scrapeSelected, setScrapeSelected] = useState<Set<number>>(new Set());
  const [scrapePreviewBlock, setScrapePreviewBlock] = useState<number | null>(null);
  const [scrapeEdits, setScrapeEdits] = useState<Map<number, string>>(new Map());

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

  const ragMaxSources = limits.ragSourcesPerAgent > 0 ? limits.ragSourcesPerAgent : 20;

  const ragUsage = useMemo(() => {
    let bytes = 0;
    let chars = 0;
    for (const s of ragSources) {
      if (typeof s.fileSize === 'number' && Number.isFinite(s.fileSize)) bytes += Math.max(0, s.fileSize);
      const c =
        typeof s.charCount === 'number' && Number.isFinite(s.charCount)
          ? s.charCount
          : (s.content ? s.content.length : 0);
      chars += Math.max(0, c);
    }
    return { bytes, chars };
  }, [ragSources]);

  const displayRagEntries = useMemo(() => {
    const q = ragSourceQuery.trim().toLowerCase();
    const indexed = ragSources.map((src, i) => ({ src, i }));
    const filtered = !q
      ? indexed
      : indexed.filter(({ src }) => {
          const blob = `${src.name} ${src.fileName ?? ''} ${src.type} ${(src.content ?? '').slice(0, 500)}`.toLowerCase();
          return blob.includes(q);
        });
    if (ragSourceSort === 'order') return filtered;
    const sorted = [...filtered];
    const label = (s: RagSource) => (s.fileName ?? s.name ?? '').toLowerCase();
    const sizeOf = (s: RagSource) =>
      typeof s.fileSize === 'number' && Number.isFinite(s.fileSize) ? s.fileSize : (s.content ? s.content.length : 0);
    const charsOf = (s: RagSource) =>
      typeof s.charCount === 'number' && Number.isFinite(s.charCount) ? s.charCount : (s.content ? s.content.length : 0);
    if (ragSourceSort === 'name') sorted.sort((a, b) => label(a.src).localeCompare(label(b.src), 'es'));
    else if (ragSourceSort === 'size') sorted.sort((a, b) => sizeOf(b.src) - sizeOf(a.src));
    else if (ragSourceSort === 'chars') sorted.sort((a, b) => charsOf(b.src) - charsOf(a.src));
    return sorted;
  }, [ragSources, ragSourceQuery, ragSourceSort]);

  useEffect(() => {
    if (!ragPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRagPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ragPreview]);

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
        setWidgetVoiceName(typeof a.widgetVoiceName === 'string' ? a.widgetVoiceName : '');
        setPersistConversationHistory(
          typeof a.persistConversationHistory === 'boolean' ? a.persistConversationHistory : true,
        );
        setStrictPurposeOnly(a.strictPurposeOnly !== false);
        setHubspotAutoCaptureContacts(a.hubspotAutoCaptureContacts === true);
        setInferenceTemperature(
          typeof a.inferenceTemperature === 'number' ? String(a.inferenceTemperature) : '',
        );
        setInferenceMaxTokens(
          typeof a.inferenceMaxTokens === 'number' ? String(a.inferenceMaxTokens) : '',
        );
        setFallbackModels(Array.isArray(a.fallbackModels) ? a.fallbackModels.slice(0, 3) : []);
        setSkills(Array.isArray(a.skills) ? a.skills : []);
        setSkillsConfig(Array.isArray(a.skillsConfig) ? a.skillsConfig : []);
        setBehaviorRules(
          Array.isArray(a.behaviorRules)
            ? (a.behaviorRules as Array<Partial<BehaviorRule>>).map((r) => ({
                id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
                title: typeof r.title === 'string' ? r.title : 'Regla sin título',
                enabled: r.enabled !== false,
                priority: typeof r.priority === 'number' ? r.priority : 100,
                category: typeof r.category === 'string' ? r.category : 'general',
                tone: typeof r.tone === 'string' ? r.tone : 'profesional',
                shortAnswers: r.shortAnswers === true,
                complaintPolicy: typeof r.complaintPolicy === 'string' ? r.complaintPolicy : '',
                unknownAnswerPolicy:
                  typeof r.unknownAnswerPolicy === 'string' ? r.unknownAnswerPolicy : '',
                interpretedRule: typeof r.interpretedRule === 'string' ? r.interpretedRule : '',
                notes: typeof r.notes === 'string' ? r.notes : '',
              }))
            : [],
        );
        setAgentFaqs(
          Array.isArray(a.agentFaqs)
            ? (a.agentFaqs as Array<Partial<AgentFaqRow>>).map((f) => ({
                id: typeof f.id === 'string' && f.id ? f.id : crypto.randomUUID(),
                question: typeof f.question === 'string' ? f.question : '',
                answer: typeof f.answer === 'string' ? f.answer : '',
                enabled: f.enabled !== false,
                priority: typeof f.priority === 'number' ? f.priority : 100,
              }))
            : [],
        );
        setFaqCandidates(
          Array.isArray(a.faqCandidates)
            ? (a.faqCandidates as Array<Partial<FaqCandidateRow>>).map((c) => ({
                id: typeof c.id === 'string' && c.id ? c.id : crypto.randomUUID(),
                key: typeof c.key === 'string' ? c.key : '',
                questionSample: typeof c.questionSample === 'string' ? c.questionSample : '',
                count: typeof c.count === 'number' ? c.count : 0,
                lastSeen: typeof c.lastSeen === 'string' ? c.lastSeen : new Date().toISOString(),
                dismissed: c.dismissed === true,
              }))
            : [],
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
    setSuccess('');
    const r = await fetch(
      `/api/mcp/connections/${encodeURIComponent(connectionId)}?landingAgentId=${encodeURIComponent(id)}`,
      { method: 'DELETE', credentials: 'include' },
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg =
        typeof j?.error === 'string'
          ? j.error
          : typeof j?.error?.message === 'string'
            ? j.error.message
            : 'No se pudo eliminar la conexión.';
      setError(msg);
      return;
    }
    setSuccess('Conexión eliminada.');
    setTimeout(() => setSuccess(''), 2200);
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

  const hubspotWidgetAutoCaptureEligible = useMemo(
    () =>
      mcpToolIds.includes('mcp:hubspot:hubspot_search_contacts') &&
      mcpToolIds.includes('mcp:hubspot:hubspot_create_contact'),
    [mcpToolIds],
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
    if (Array.isArray(data.agent?.ragSources)) setRagSources(data.agent.ragSources);
    if (data.agent?.tools) setTools(normalizeTools(data.agent.tools));
    if (data.agent && 'widgetPublicToken' in data.agent) {
      setWidgetPublicToken(typeof data.agent.widgetPublicToken === 'string' ? data.agent.widgetPublicToken : '');
    }
    if (data.agent && 'widgetVoiceName' in data.agent) {
      setWidgetVoiceName(typeof data.agent.widgetVoiceName === 'string' ? data.agent.widgetVoiceName : '');
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
    const mergedPrompt = mergeSystemPromptWithManagedBlocks(
      systemPrompt,
      behaviorRules,
      agentFaqs,
      faqCandidates,
    );
    setSystemPrompt(mergedPrompt);
    const patch: Record<string, unknown> = {
      name,
      description,
      systemPrompt: mergedPrompt,
      model,
      fallbackModels,
      widgetPublicToken: widgetPublicToken.trim() ? widgetPublicToken.trim().slice(0, 512) : null,
      persistConversationHistory,
      strictPurposeOnly,
      skills,
      skillsConfig,
      behaviorRules,
      agentFaqs,
      faqCandidates,
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

  async function saveVoice() {
    await save({ widgetVoiceName: widgetVoiceName.trim() || null });
  }

  async function saveTools() {
    await save({ tools, enabledMcpToolIds: mcpToolIds, hubspotAutoCaptureContacts });
  }

  async function saveRules() {
    const mergedPrompt = mergeSystemPromptWithManagedBlocks(
      systemPrompt,
      behaviorRules,
      agentFaqs,
      faqCandidates,
    );
    setSystemPrompt(mergedPrompt);
    await save({ behaviorRules, agentFaqs, faqCandidates, systemPrompt: mergedPrompt });
  }

  async function saveFaqs() {
    const mergedPrompt = mergeSystemPromptWithManagedBlocks(
      systemPrompt,
      behaviorRules,
      agentFaqs,
      faqCandidates,
    );
    setSystemPrompt(mergedPrompt);
    await save({ agentFaqs, faqCandidates, systemPrompt: mergedPrompt });
  }

  async function testSavedWebhook() {
    setError('');
    setSuccess('');
    setWebhookTestBusy(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(id)}/test-webhook`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Error al probar webhook.');
        return;
      }
      if (data.ok) {
        setSuccess(`Webhook OK: el endpoint respondió HTTP ${data.status}.`);
      } else {
        setSuccess(
          `El endpoint respondió HTTP ${data.status}. Revisa que acepte POST JSON y devuelva 2xx si todo va bien.`,
        );
      }
    } catch {
      setError('No se pudo probar el webhook (red, timeout o servidor inalcanzable).');
    } finally {
      setWebhookTestBusy(false);
      setTimeout(() => setSuccess(''), 6000);
    }
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

  async function scrapeAndSegment() {
    if (!scrapeUrl.trim() || scrapeStatus === 'running') return;
    setScrapeStatus('running');
    setScrapeBlocks(null);
    setScrapeError('');
    setScrapeTitle('');
    setScrapeExtractedBy(null);
    setScrapeProgress(0);
    setScrapeStep('Iniciando…');

    // Animación continua basada en tiempo — nunca se congela
    // Cada fase avanza suavemente hacia su target; la última se arrastra
    // hasta 98% para nunca prometer "casi listo" antes de tiempo.
    const phases = [
      { target: 12,  ms: 1_200,  label: 'Iniciando navegador…' },
      { target: 52,  ms: 14_000, label: 'Cargando página con Chrome…' },
      { target: 68,  ms: 3_000,  label: 'Extrayendo contenido…' },
      { target: 92,  ms: 28_000, label: 'Analizando con IA…' },
      { target: 98,  ms: 20_000, label: 'Finalizando…' },
    ];

    let phaseIdx   = 0;
    let phaseFrom  = 0;
    let phaseStart = Date.now();

    const tick = setInterval(() => {
      if (phaseIdx >= phases.length) return;
      const phase   = phases[phaseIdx];
      const elapsed = Date.now() - phaseStart;
      const ratio   = Math.min(1, elapsed / phase.ms);
      // ease-out: desacelera al acercarse al target de cada fase
      const eased   = 1 - Math.pow(1 - ratio, 2);
      const pct     = phaseFrom + (phase.target - phaseFrom) * eased;

      setScrapeProgress(Math.round(pct * 10) / 10);
      setScrapeStep(phase.label);

      if (ratio >= 0.99) {
        phaseFrom  = phase.target;
        phaseStart = Date.now();
        phaseIdx++;
      }
    }, 80); // tick cada 80ms → animación fluida sin sobrecargar

    try {
      const res  = await fetch(`/api/agents/${id}/rag/scrape`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: scrapeUrl }),
      });
      clearInterval(tick);
      const data = await res.json();
      if (!res.ok) {
        setScrapeError(data.error ?? 'Error al procesar la URL.');
        setScrapeStatus('error');
        setScrapeProgress(0);
        return;
      }
      const blocks = data.blocks ?? [];
      setScrapeBlocks(blocks);
      setScrapeSelected(new Set(blocks.map((_: unknown, i: number) => i)));
      setScrapeTitle(data.title ?? '');
      setScrapeExtractedBy(data.extractedBy ?? null);
      setScrapeProgress(100);
      setScrapeStep('¡Listo!');
      setScrapeStatus('done');
    } catch (err) {
      clearInterval(tick);
      setScrapeError(err instanceof Error ? err.message : 'Error de red.');
      setScrapeStatus('error');
      setScrapeProgress(0);
    }
  }

  function addScrapedBlocksToRag() {
    if (!scrapeBlocks?.length || scrapeSelected.size === 0) return;
    const available = ragMaxSources - ragSources.length;
    const toAdd = scrapeBlocks
      .map((b, i) => ({ b, i }))
      .filter(({ i }) => scrapeSelected.has(i))
      .slice(0, available)
      .map(({ b, i }) => {
        const content = scrapeEdits.get(i) ?? b.content;
        return { type: 'text' as const, name: b.title, content, charCount: content.length };
      });
    if (toAdd.length === 0) {
      setUploadErr(`Límite de ${ragMaxSources} fuentes alcanzado.`);
      return;
    }
    const next = [...ragSources, ...toAdd];
    setRagSources(next);
    save({ ragEnabled, ragSources: next });
    setScrapeBlocks(null);
    setScrapeSelected(new Set());
    setScrapePreviewBlock(null);
    setScrapeEdits(new Map());
    setScrapeStatus('idle');
    setScrapeUrl('');
    setScrapeStep('');
    setScrapeTitle('');
    setScrapeExtractedBy(null);
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

  function openRagPreviewFromSource(src: RagSource) {
    const raw = src.content ?? '';
    const max = 12_000;
    const body = raw.slice(0, max);
    setRagPreview({
      title: src.fileName ?? src.name ?? 'Vista previa',
      snippet:
        raw.length > max
          ? `${body}\n\n… (${raw.length.toLocaleString('es')} caracteres en total; el índice trunca a ~${RAG_MAX_EXTRACTED_CHARS.toLocaleString('es')} por archivo).`
          : body,
      totalChars: raw.length,
    });
  }

  async function uploadSingleRagFile(file: File): Promise<{ ok: boolean; error?: string; preview?: RagSource }> {
    if (agent?.isPlatform) return { ok: false, error: 'Agente de solo lectura.' };
    const maxS = limits.ragSourcesPerAgent > 0 ? limits.ragSourcesPerAgent : 20;
    if (ragSourcesRef.current.length >= maxS) {
      return { ok: false, error: `Máximo ${maxS} fuentes en tu plan.` };
    }
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/agents/${id}/rag-upload`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: typeof data.error === 'string' ? data.error : 'Error al subir archivo.' };
    const agentRes = await fetch(`/api/agents/${id}`);
    const agentData = await agentRes.json();
    if (agentData.agent) {
      setRagSources(agentData.agent.ragSources ?? []);
      setAgent(agentData.agent);
    }
    return { ok: true, preview: data.source as RagSource | undefined };
  }

  async function runRagUploadBatch(files: File[]) {
    if (agent?.isPlatform || readOnly || !files.length) return;
    setUploadErr('');
    setUploadMsg('');
    const list = Array.from(files).filter((f) => f.size > 0);
    if (!list.length) return;
    const maxS = limits.ragSourcesPerAgent > 0 ? limits.ragSourcesPerAgent : 20;
    let lastPreview: RagSource | undefined;
    for (let k = 0; k < list.length; k++) {
      if (ragSourcesRef.current.length >= maxS) {
        setUploadErr((e) =>
          (e ? `${e} ` : '') + `Límite de ${maxS} fuentes: no se procesaron más archivos.`,
        );
        break;
      }
      setRagUploadProgress({ current: k + 1, total: list.length, fileName: list[k].name });
      const r = await uploadSingleRagFile(list[k]);
      if (!r.ok) {
        setUploadErr((e) => (e ? `${e} | ` : '') + `${list[k].name}: ${r.error ?? 'error'}`);
      } else if (r.preview) {
        lastPreview = r.preview;
      }
    }
    setRagUploadProgress(null);
    if (lastPreview) {
      const raw = String(lastPreview.content ?? '');
      const max = 12_000;
      const body = raw.slice(0, max);
      setRagPreview({
        title: lastPreview.fileName ?? lastPreview.name ?? 'Texto extraído',
        snippet:
          raw.length > max
            ? `${body}\n\n… (${raw.length.toLocaleString('es')} caracteres en total).`
            : body,
        totalChars: raw.length,
      });
    }
    setUploadMsg(list.length > 1 ? `Listo: ${list.length} archivo(s) procesados.` : 'Archivo procesado.');
    setTimeout(() => setUploadMsg(''), 5000);
  }

  async function duplicateRagSourceAt(index: number) {
    if (readOnly || agent?.isPlatform) return;
    const src = ragSources[index];
    if (!src) return;
    const maxS = limits.ragSourcesPerAgent > 0 ? limits.ragSourcesPerAgent : 20;
    if (ragSources.length >= maxS) {
      setUploadErr(`Máximo ${maxS} fuentes. Elimina una antes de duplicar.`);
      return;
    }
    const base = (src.fileName ?? src.name ?? 'fuente').slice(0, 180);
    const slice = (src.content ?? '').slice(0, RAG_MAX_EXTRACTED_CHARS);
    const newEntry: RagSource =
      src.type === 'file'
        ? {
            type: 'text',
            name: `Copia — ${base}`,
            content: slice,
            charCount: slice.length,
          }
        : src.type === 'url'
          ? {
              ...src,
              name: `Copia — ${(src.name || 'URL').slice(0, 160)}`,
              content: (src.content ?? '').slice(0, RAG_MAX_EXTRACTED_CHARS),
            }
          : {
              ...src,
              name: `Copia — ${(src.name || 'texto').slice(0, 160)}`,
              content: slice,
              charCount: slice.length,
            };
    const next = [...ragSources, newEntry];
    setRagSources(next);
    const ok = await save({ ragEnabled, ragSources: next });
    if (!ok) {
      const ar = await fetch(`/api/agents/${id}`).then((x) => x.json());
      if (ar.agent) setRagSources(ar.agent.ragSources ?? []);
    }
  }

  async function retryRagHubSync() {
    if (!agent || agent.isPlatform) return;
    setRagRetryHubBusy(true);
    setUploadErr('');
    const res = await fetch(`/api/agents/${id}/retry-hub-sync`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setRagRetryHubBusy(false);
    if (!res.ok) {
      setUploadErr(typeof data.error === 'string' ? data.error : 'No se pudo sincronizar el catálogo con el hub.');
      return;
    }
    const ar = await fetch(`/api/agents/${id}`).then((x) => x.json());
    if (ar.agent) setAgent(ar.agent);
    setUploadMsg('Catálogo del hub sincronizado.');
    setTimeout(() => setUploadMsg(''), 4000);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) runRagUploadBatch(Array.from(e.dataTransfer.files));
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files;
    if (fl?.length) runRagUploadBatch(Array.from(fl));
    e.target.value = '';
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
  const getRuntimeSkillConfig = useCallback(
    (skillId: string) => skillsConfig.find((s) => s?.id === skillId),
    [skillsConfig],
  );
  const upsertRuntimeSkillConfig = useCallback(
    (skillId: string, enabled: boolean, fallbackPriority: number) => {
      setSkillsConfig((prev) => {
        const idx = prev.findIndex((s) => s?.id === skillId);
        if (idx === -1) {
          if (!enabled) return prev;
          return [...prev, { id: skillId, enabled: true, priority: fallbackPriority }];
        }
        const next = [...prev];
        next[idx] = { ...next[idx], enabled };
        return next;
      });
    },
    [],
  );
  const setRuntimeSkillPriority = useCallback((skillId: string, value: string, fallbackPriority: number) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const p = Math.max(0, Math.min(1000, Math.floor(n)));
    setSkillsConfig((prev) => {
      const idx = prev.findIndex((s) => s?.id === skillId);
      if (idx === -1) return [...prev, { id: skillId, enabled: true, priority: p || fallbackPriority }];
      const next = [...prev];
      next[idx] = { ...next[idx], priority: p };
      return next;
    });
  }, []);
  const addCustomSkill = useCallback(() => {
    const v = customSkillInput.trim();
    if (!v) return;
    setSkills((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setCustomSkillInput('');
  }, [customSkillInput]);

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
    { id: 'rules', label: `Reglas (${behaviorRules.length})`, icon: <Sparkles size={13} /> },
    {
      id: 'faqs',
      label: `FAQ (${agentFaqs.length})`,
      icon: <HelpCircle size={13} />,
    },
    { id: 'tools',   label: `Herramientas (${tools.length + mcpToolIds.length})`, icon: <Wrench size={13} /> },
    { id: 'rag',     label: `RAG (${ragN})`, icon: <Zap size={13} /> },
    { id: 'subagents', label: `Sub-agentes (${subAgents.length})`, icon: <Network size={13} /> },
    { id: 'voice', label: 'Voz', icon: <Volume2 size={13} /> },
  ];

  return (
    <div className="relative overflow-hidden" style={{ minHeight: '100%' }}>
      <div className="hero-glow pointer-events-none" style={{ background: R, top: '-200px', right: '-60px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: B, top: '120px', left: '-120px' }} />

      <div className="relative px-4 py-4 max-w-3xl mx-auto">
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
                <div style={{ position: 'relative' }}>
                  <input className="landing-input" style={{ ...inp, paddingRight: readOnly ? undefined : '36px' }} value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
                  {!readOnly && <AIInputButton fieldType="agent_name" fieldName="Nombre del agente" agentContext={{ purpose: description }} onResult={(t) => setName(t)} />}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>Descripción</label>
                <div style={{ position: 'relative' }}>
                  <input className="landing-input" style={{ ...inp, paddingRight: readOnly ? undefined : '36px' }} value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
                  {!readOnly && <AIInputButton fieldType="agent_description" fieldName="Descripción del agente" agentContext={{ name, purpose: description }} onResult={(t) => setDescription(t)} />}
                </div>
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
            <p style={sectionTitle}>Solo propósito del agente</p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
              Si está activo, el motor en AIBackHub refuerza en el system prompt que el agente{' '}
              <strong>no responda temas fuera de su rol</strong>: solo lo definido en instrucciones, FAQs, reglas y lo que permitan herramientas MCP, skills y RAG. Útil para un vendedor o soporte que no debe improvisar en otros dominios.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: readOnly ? 'default' : 'pointer' }}>
              <div
                onClick={() => !readOnly && setStrictPurposeOnly((prev) => !prev)}
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  position: 'relative',
                  cursor: readOnly ? 'not-allowed' : 'pointer',
                  background: strictPurposeOnly ? `linear-gradient(90deg, ${R}, ${O})` : 'var(--border)',
                  transition: 'background 0.2s',
                  opacity: readOnly ? 0.75 : 1,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: strictPurposeOnly ? 21 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                  }}
                />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                {strictPurposeOnly ? 'Modo solo propósito activado' : 'Modo solo propósito desactivado'}
              </span>
            </label>
            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '10px', marginBottom: 0 }}>
              Guarda con &quot;Guardar información&quot; para sincronizar con AIBackHub.
            </p>
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
            {/* Buscador */}
            <div style={{ border: '1px solid var(--border)', background: 'var(--muted)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <input
                className="landing-input"
                style={inp}
                value={modelQuery}
                onChange={(e) => { setModelQuery(e.target.value); setShowAllModels(false); }}
                placeholder="Buscar por nombre, proveedor o capacidad..."
                disabled={readOnly}
              />
            </div>

            {/* Tabs categoría */}
            {(() => {
              const CATS: { id: string; label: string }[] = [
                { id: 'all', label: 'Todos' },
                { id: 'multimodal', label: 'Multimodal' },
                { id: 'chat', label: 'Chat' },
                { id: 'vision', label: 'Visión' },
                { id: 'audio', label: 'Audio' },
                { id: 'tts', label: 'TTS' },
                { id: 'image', label: 'Imagen' },
              ];
              const TIERS: { id: string; label: string; color: string }[] = [
                { id: 'all', label: 'Todos', color: 'var(--foreground)' },
                { id: 'stable', label: 'Stable', color: '#16a34a' },
                { id: 'pro', label: 'Pro', color: '#7c3aed' },
                { id: 'flash', label: 'Flash', color: '#0284c7' },
                { id: 'lite', label: 'Lite', color: '#d97706' },
                { id: 'preview', label: 'Preview', color: '#6366f1' },
              ];
              const TIER_COLOR: Record<string, string> = {
                stable: '#16a34a', pro: '#7c3aed', flash: '#0284c7', lite: '#d97706', preview: '#6366f1',
              };

              const filtered = displayModels.filter((m) => {
                const q = modelQuery.trim().toLowerCase();
                if (q && !(m.name.toLowerCase().includes(q) || m.provider?.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))) return false;
                if (modelCatFilter !== 'all' && (m.category ?? 'chat') !== modelCatFilter) return false;
                if (modelTierFilter !== 'all' && (m.tier ?? 'stable') !== modelTierFilter) return false;
                return true;
              });

              const selectedFirst = (() => {
                const idx = filtered.findIndex((m) => m.id === model);
                if (idx <= 0) return filtered;
                return [filtered[idx], ...filtered.slice(0, idx), ...filtered.slice(idx + 1)];
              })();

              const visible = showAllModels ? selectedFirst : selectedFirst.slice(0, 12);

              const activeCatTabStyle = (id: string): React.CSSProperties => ({
                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${modelCatFilter === id ? R : 'var(--border)'}`,
                background: modelCatFilter === id ? `rgba(228,20,20,0.08)` : 'var(--background)',
                color: modelCatFilter === id ? R : 'var(--muted-foreground)',
              });
              const activeTierTabStyle = (id: string, color: string): React.CSSProperties => ({
                padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${modelTierFilter === id ? color : 'var(--border)'}`,
                background: modelTierFilter === id ? `${color}18` : 'var(--background)',
                color: modelTierFilter === id ? color : 'var(--muted-foreground)',
              });

              return (
                <>
                  {/* Categoría */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    {CATS.filter((c) => c.id === 'all' || displayModels.some((m) => (m.category ?? 'chat') === c.id)).map((c) => (
                      <button key={c.id} type="button" style={activeCatTabStyle(c.id)}
                        onClick={() => { setModelCatFilter(c.id); setShowAllModels(false); }}>
                        {c.label}
                      </button>
                    ))}
                  </div>

                  {/* Tier */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    {TIERS.filter((t) => t.id === 'all' || displayModels.some((m) => (m.tier ?? 'stable') === t.id)).map((t) => (
                      <button key={t.id} type="button" style={activeTierTabStyle(t.id, t.color)}
                        onClick={() => { setModelTierFilter(t.id); setShowAllModels(false); }}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '0 0 8px' }}>
                    {filtered.length} modelo{filtered.length !== 1 ? 's' : ''}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 7 }}>
                    {visible.map((m) => {
                      const isSelected = model === m.id;
                      const tierColor = TIER_COLOR[m.tier ?? 'stable'] ?? 'var(--muted-foreground)';
                      return (
                        <button key={m.id} type="button" onClick={() => setModel(m.id)} style={{
                          padding: '10px 12px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                          border: `1px solid ${isSelected ? R : 'var(--border)'}`,
                          background: isSelected ? 'rgba(228,20,20,0.07)' : 'var(--background)',
                          position: 'relative',
                        }}>
                          {/* Tier badge */}
                          <span style={{
                            position: 'absolute', top: 6, right: 7,
                            fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 8,
                            background: `${tierColor}18`, color: tierColor, textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>
                            {m.tier ?? 'stable'}
                          </span>
                          <p style={{ fontSize: 11, fontWeight: 700, margin: '0 0 2px', paddingRight: 40, color: isSelected ? R : 'var(--foreground)' }}>{m.name}</p>
                          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: 0 }}>
                            {m.provider}
                            {m.maxTokens != null ? ` · ${(m.maxTokens / 1000).toFixed(0)}k ctx` : ''}
                          </p>
                          {m.description ? (
                            <p style={{ fontSize: 9, color: 'var(--muted-foreground)', margin: '3px 0 0', lineHeight: 1.35 }}>{m.description}</p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {filtered.length > 12 && (
                    <button type="button" onClick={() => setShowAllModels((v) => !v)}
                      style={{ marginTop: 10, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', cursor: 'pointer' }}>
                      {showAllModels ? 'Ver menos' : `Ver todos (${filtered.length})`}
                    </button>
                  )}
                </>
              );
            })()}
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

            {/* Modelos de respaldo */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: 'var(--foreground)' }}>
                    Modelos de respaldo
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    Se usan si el modelo principal falla o llega al límite. Mín. 1 · Máx. 3
                  </p>
                </div>
                {!readOnly && fallbackModels.length < 3 && (
                  <button
                    type="button"
                    onClick={() => { setShowFallbackPanel((v) => !v); setFallbackQuery(''); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${showFallbackPanel ? R : 'var(--border)'}`,
                      background: showFallbackPanel ? `rgba(228,20,20,0.08)` : 'var(--background)',
                      color: showFallbackPanel ? R : 'var(--foreground)',
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={13} />
                    Agregar
                  </button>
                )}
              </div>

              {/* Pills de modelos seleccionados */}
              {fallbackModels.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: showFallbackPanel ? 12 : 0 }}>
                  {fallbackModels.map((mid, idx) => {
                    const info = displayModels.find((m) => m.id === mid);
                    return (
                      <div key={mid} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        border: '1px solid var(--border)', background: 'var(--muted)',
                        color: 'var(--foreground)',
                      }}>
                        <span style={{ fontSize: 10, color: 'var(--muted-foreground)', marginRight: 2 }}>#{idx + 1}</span>
                        {info?.name ?? mid}
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => setFallbackModels((p) => p.filter((x) => x !== mid))}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 0, display: 'flex', lineHeight: 1 }}
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Panel selector */}
              {showFallbackPanel && !readOnly && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--muted)' }}>
                  <input
                    className="landing-input"
                    style={{ ...inp, marginBottom: 10 }}
                    placeholder="Buscar modelo de respaldo..."
                    value={fallbackQuery}
                    onChange={(e) => setFallbackQuery(e.target.value)}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                    {displayModels
                      .filter((m) => {
                        if (m.id === model) return false;
                        if (fallbackModels.includes(m.id)) return false;
                        const q = fallbackQuery.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          m.name.toLowerCase().includes(q) ||
                          m.provider?.toLowerCase().includes(q) ||
                          m.id.toLowerCase().includes(q)
                        );
                      })
                      .map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            if (fallbackModels.length >= 3) return;
                            setFallbackModels((p) => [...p, m.id]);
                            if (fallbackModels.length + 1 >= 3) setShowFallbackPanel(false);
                          }}
                          style={{
                            padding: '8px 10px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'var(--background)',
                          }}
                        >
                          <p style={{ fontSize: '11px', fontWeight: 700, margin: '0 0 1px', color: 'var(--foreground)' }}>{m.name}</p>
                          <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: 0 }}>
                            {m.provider}{m.maxTokens ? ` · ${m.maxTokens.toLocaleString()} ctx` : ''}
                          </p>
                        </button>
                      ))}
                  </div>
                  {fallbackModels.length >= 3 && (
                    <p style={{ fontSize: 11, color: '#d97706', margin: '8px 0 0' }}>Máximo 3 modelos de respaldo alcanzado.</p>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard>
            <p style={sectionTitle}>Skills</p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
              Capacidades de este agente. Se sincronizan con el hub al guardar.
            </p>
            <div style={{ marginBottom: '10px' }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: 'rgba(0,172,248,0.12)', color: B,
              }}>
                {skills.length} seleccionada{skills.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {AGENT_SKILLS.map((skill) => {
                const active = skills.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    title={skill.description}
                    disabled={readOnly}
                    onClick={() => {
                      if (readOnly) return;
                      setSkills((prev) =>
                        active ? prev.filter((s) => s !== skill.id) : [...prev, skill.id],
                      );
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 700,
                      border: `1px solid ${active ? `${skill.color}66` : 'var(--border)'}`,
                      background: active ? `${skill.color}18` : 'transparent',
                      color: active ? skill.color : 'var(--muted-foreground)',
                      cursor: readOnly ? 'default' : 'pointer',
                      transition: 'all 0.15s',
                      opacity: readOnly ? 0.7 : 1,
                    }}
                  >
                    {active ? '✓ ' : ''}{skill.label}
                  </button>
                );
              })}
              {skills
                .filter((sid) => !AGENT_SKILLS.some((s) => s.id === sid))
                .map((sid) => (
                  <button
                    key={sid}
                    type="button"
                    title="Skill personalizada"
                    disabled={readOnly}
                    onClick={() => {
                      if (readOnly) return;
                      setSkills((prev) => prev.filter((s) => s !== sid));
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 700,
                      border: '1px solid rgba(99,102,241,0.28)',
                      background: 'rgba(99,102,241,0.09)',
                      color: '#6366f1',
                      cursor: readOnly ? 'default' : 'pointer',
                    }}
                  >
                    {sid} ✕
                  </button>
                ))}
            </div>
            {!readOnly && (
              <div style={{
                marginTop: '10px',
                display: 'flex',
                gap: '8px',
                padding: '10px',
                borderRadius: '12px',
                border: '1px dashed var(--border)',
                background: 'rgba(0,172,248,0.04)',
              }}>
                <input
                  className="landing-input"
                  style={{ ...inp, flex: 1 }}
                  value={customSkillInput}
                  onChange={(e) => setCustomSkillInput(e.target.value)}
                  placeholder="Agregar skill personalizada (id)"
                />
                <button
                  type="button"
                  onClick={addCustomSkill}
                  style={{
                    padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border)',
                    background: 'var(--background)', cursor: 'pointer', fontWeight: 700, fontSize: '12px',
                  }}
                >
                  Agregar
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard bar="bo">
            <p style={sectionTitle}>Perfiles runtime (cerebro)</p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
              Estos perfiles cambian comportamiento real en AIBackHub (prompt/tools/settings).
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {RUNTIME_SKILL_TEMPLATES.map((tpl) => {
                const cfg = getRuntimeSkillConfig(tpl.id);
                const enabled = cfg?.enabled !== false && Boolean(cfg);
                const priority = cfg?.priority ?? tpl.defaultPriority;
                return (
                  <div key={tpl.id} style={{
                    border: `1px solid ${enabled ? `${R}30` : 'var(--border)'}`,
                    borderRadius: '12px',
                    padding: '12px',
                    background: enabled ? 'rgba(228,20,20,0.05)' : 'transparent',
                    transition: 'all .15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: enabled ? R : 'var(--foreground)' }}>
                          <span style={{ marginRight: 6 }}>{tpl.icon}</span>{tpl.name}
                        </p>
                        <p style={{ margin: 0, fontSize: '10px', color: 'var(--muted-foreground)' }}>{tpl.id}</p>
                      </div>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => !readOnly && upsertRuntimeSkillConfig(tpl.id, !enabled, tpl.defaultPriority)}
                        style={{
                          padding: '5px 10px', borderRadius: '999px', border: '1px solid var(--border)',
                          background: enabled ? `linear-gradient(90deg, ${R}, ${O})` : 'transparent',
                          color: enabled ? '#fff' : 'var(--muted-foreground)', cursor: readOnly ? 'default' : 'pointer',
                          fontSize: '11px', fontWeight: 700,
                        }}
                      >
                        {enabled ? 'Activo' : 'Inactivo'}
                      </button>
                    </div>
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ fontSize: 11, color: 'var(--muted-foreground)', cursor: 'pointer', userSelect: 'none' }}>
                        Ver detalle del perfil
                      </summary>
                      <p style={{ margin: '8px 0 6px', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
                        {tpl.description}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Prioridad</label>
                        <input
                          className="landing-input"
                          style={{ ...inp, width: '120px', padding: '6px 10px', background: enabled ? 'var(--background)' : 'transparent' }}
                          type="number"
                          min={0}
                          max={1000}
                          value={String(priority)}
                          onChange={(e) => setRuntimeSkillPriority(tpl.id, e.target.value, tpl.defaultPriority)}
                          disabled={readOnly}
                        />
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard bar="bo">
            <p style={sectionTitle}>System Prompt</p>
            <div style={{ position: 'relative' }}>
              <textarea
                className="landing-input"
                style={{ ...inp, minHeight: '160px', resize: 'vertical', fontFamily: 'inherit', paddingRight: readOnly ? undefined : '36px' }}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                disabled={readOnly}
                readOnly={readOnly}
              />
              {!readOnly && <AIInputButton fieldType="system_prompt" fieldName="System Prompt" agentContext={{ name, purpose: description }} onResult={(t) => setSystemPrompt(t)} position="right-top" />}
            </div>
          </SectionCard>

          {!readOnly && (
            <SectionCard bar="bo">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={14} style={{ color: '#6366f1' }} />
                  <p style={{ ...sectionTitle, marginBottom: 0, color: '#6366f1' }}>Sugerir con AI</p>
                </div>
                <button
                  type="button"
                  onClick={handleSuggestAgent}
                  disabled={!name.trim() || aiSuggesting}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 16px', borderRadius: 10, border: 'none',
                    background: name.trim() && !aiSuggesting ? '#6366f1' : 'var(--border)',
                    color: name.trim() && !aiSuggesting ? '#fff' : 'var(--muted-foreground)',
                    fontSize: 12, fontWeight: 600,
                    cursor: name.trim() && !aiSuggesting ? 'pointer' : 'not-allowed',
                  }}
                >
                  {aiSuggesting
                    ? <><Loader2 size={12} className="animate-spin" /> Generando...</>
                    : <><Sparkles size={12} /> Generar sugerencias</>}
                </button>
              </div>

              {aiSuggestions && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
                  {/* System Prompt */}
                  <div style={{ padding: '12px 14px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>System Prompt sugerido</span>
                      <button type="button" onClick={() => setSystemPrompt(aiSuggestions.systemPrompt)}
                        style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: 'none', padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}>
                        Aplicar
                      </button>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>
                      {aiSuggestions.systemPrompt}
                    </p>
                  </div>

                  {/* FAQs */}
                  {aiSuggestions.faqs.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>FAQs sugeridas</span>
                        <button type="button"
                          onClick={() => {
                            setAgentFaqs((prev) => [
                              ...prev,
                              ...aiSuggestions.faqs.map((f, i) => ({ id: crypto.randomUUID(), question: f.question, answer: f.answer, enabled: true, priority: (prev.length + i) * 10 })),
                            ]);
                            setSuggestFaqsAdded(new Set(aiSuggestions.faqs.map((_, i) => i)));
                          }}
                          style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: 'none', padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}>
                          Agregar todas
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {aiSuggestions.faqs.map((faq, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 3px' }}>{faq.question}</p>
                              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.4 }}>{faq.answer}</p>
                            </div>
                            <button type="button"
                              onClick={() => {
                                if (!suggestFaqsAdded.has(i)) {
                                  setAgentFaqs((prev) => [...prev, { id: crypto.randomUUID(), question: faq.question, answer: faq.answer, enabled: true, priority: prev.length * 10 }]);
                                  setSuggestFaqsAdded((prev) => new Set([...prev, i]));
                                }
                              }}
                              disabled={suggestFaqsAdded.has(i)}
                              style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, color: suggestFaqsAdded.has(i) ? '#22c55e' : '#6366f1', background: suggestFaqsAdded.has(i) ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.1)', border: 'none', padding: '4px 10px', borderRadius: 7, cursor: suggestFaqsAdded.has(i) ? 'default' : 'pointer' }}>
                              {suggestFaqsAdded.has(i) ? '✓ Agregada' : '+ Agregar'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reglas */}
                  {aiSuggestions.rules.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>Reglas sugeridas</span>
                        <button type="button"
                          onClick={() => {
                            setBehaviorRules((prev) => [
                              ...prev,
                              ...aiSuggestions.rules.map((r) => ({ ...createEmptyRule(), title: r.title, interpretedRule: r.description })),
                            ]);
                            setSuggestRulesAdded(new Set(aiSuggestions.rules.map((_, i) => i)));
                          }}
                          style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: 'none', padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}>
                          Agregar todas
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {aiSuggestions.rules.map((rule, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 3px' }}>{rule.title}</p>
                              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.4 }}>{rule.description}</p>
                            </div>
                            <button type="button"
                              onClick={() => {
                                if (!suggestRulesAdded.has(i)) {
                                  setBehaviorRules((prev) => [...prev, { ...createEmptyRule(), title: rule.title, interpretedRule: rule.description }]);
                                  setSuggestRulesAdded((prev) => new Set([...prev, i]));
                                }
                              }}
                              disabled={suggestRulesAdded.has(i)}
                              style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, color: suggestRulesAdded.has(i) ? '#22c55e' : '#6366f1', background: suggestRulesAdded.has(i) ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.1)', border: 'none', padding: '4px 10px', borderRadius: 7, cursor: suggestRulesAdded.has(i) ? 'default' : 'pointer' }}>
                              {suggestRulesAdded.has(i) ? '✓ Agregada' : '+ Agregar'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          )}

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

      {/* ── RULES TAB ───────────────────────────────────────────────────────── */}
      {tab === 'rules' && (
        <>
          <SectionCard>
            <p style={sectionTitle}>Reglas de comportamiento y flujo</p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
              Configura políticas del agente (prioridad, tono, reclamos, respuestas cortas y qué hacer cuando no sabe). Al guardar, estas reglas se integran automáticamente al system prompt.
            </p>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setBehaviorRules((prev) => [...prev, createEmptyRule()])}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-opacity"
                style={{ ...BTN_PRIMARY, cursor: 'pointer' }}
              >
                <Plus size={13} /> Agregar regla
              </button>
            )}
          </SectionCard>

          {behaviorRules.length === 0 ? (
            <SectionCard innerStyle={{ textAlign: 'center', padding: '28px 16px' }}>
              <Sparkles size={24} style={{ color: 'var(--muted-foreground)', margin: '0 auto 8px' }} />
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', margin: 0 }}>
                Sin reglas configuradas aún.
              </p>
            </SectionCard>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {behaviorRules
                .slice()
                .sort((a, b) => a.priority - b.priority)
                .map((rule) => (
                  <SectionCard key={rule.id} outerStyle={{ borderColor: 'rgba(228,20,20,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{rule.title || 'Regla sin título'}</p>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() =>
                            setBehaviorRules((prev) => prev.filter((x) => x.id !== rule.id))
                          }
                          style={{
                            padding: '4px 8px',
                            borderRadius: 8,
                            border: '1px solid rgba(239,68,68,0.35)',
                            background: 'rgba(239,68,68,0.08)',
                            color: '#ef4444',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
                      <input
                        className="landing-input"
                        style={inp}
                        value={rule.title}
                        disabled={readOnly}
                        onChange={(e) =>
                          setBehaviorRules((prev) =>
                            prev.map((x) => (x.id === rule.id ? { ...x, title: e.target.value } : x)),
                          )
                        }
                        placeholder="Título de regla"
                      />
                      <input
                        className="landing-input"
                        style={inp}
                        type="number"
                        min={0}
                        max={1000}
                        value={String(rule.priority)}
                        disabled={readOnly}
                        onChange={(e) =>
                          setBehaviorRules((prev) =>
                            prev.map((x) =>
                              x.id === rule.id ? { ...x, priority: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) } : x,
                            ),
                          )
                        }
                        placeholder="Prioridad"
                      />
                      <select
                        className="landing-input"
                        style={inp}
                        value={rule.category}
                        disabled={readOnly}
                        onChange={(e) =>
                          setBehaviorRules((prev) =>
                            prev.map((x) => (x.id === rule.id ? { ...x, category: e.target.value } : x)),
                          )
                        }
                      >
                        <option value="general">General</option>
                        <option value="tono">Tono</option>
                        <option value="flujo">Flujo</option>
                        <option value="queja_reclamo">Queja/Reclamo</option>
                        <option value="incertidumbre">Si no sabe</option>
                        <option value="estilo_respuesta">Estilo respuesta</option>
                        <option value="negocio">Negocio</option>
                      </select>
                      <select
                        className="landing-input"
                        style={inp}
                        value={rule.tone}
                        disabled={readOnly}
                        onChange={(e) =>
                          setBehaviorRules((prev) =>
                            prev.map((x) => (x.id === rule.id ? { ...x, tone: e.target.value } : x)),
                          )
                        }
                      >
                        <option value="profesional">Profesional</option>
                        <option value="empatico">Empático</option>
                        <option value="cercano">Cercano</option>
                        <option value="formal">Formal</option>
                        <option value="directo">Directo</option>
                        <option value="tecnico">Técnico</option>
                      </select>
                    </div>
                    <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                      <div style={{ position: 'relative' }}>
                        <textarea
                          className="landing-input"
                          style={{ ...inp, minHeight: 70, resize: 'vertical', fontFamily: 'inherit', paddingRight: readOnly ? undefined : '36px' }}
                          value={rule.interpretedRule}
                          disabled={readOnly}
                          onChange={(e) =>
                            setBehaviorRules((prev) =>
                              prev.map((x) => (x.id === rule.id ? { ...x, interpretedRule: e.target.value } : x)),
                            )
                          }
                          placeholder="Regla interpretada (qué debe hacer exactamente el agente)"
                        />
                        {!readOnly && <AIInputButton fieldType="behavior_rule" fieldName="Regla de comportamiento" agentContext={{ name, purpose: description }} onResult={(t) => setBehaviorRules((prev) => prev.map((x) => (x.id === rule.id ? { ...x, interpretedRule: t } : x)))} position="right-top" />}
                      </div>
                      <input
                        className="landing-input"
                        style={inp}
                        value={rule.complaintPolicy}
                        disabled={readOnly}
                        onChange={(e) =>
                          setBehaviorRules((prev) =>
                            prev.map((x) => (x.id === rule.id ? { ...x, complaintPolicy: e.target.value } : x)),
                          )
                        }
                        placeholder="Cómo responder ante queja o reclamo"
                      />
                      <input
                        className="landing-input"
                        style={inp}
                        value={rule.unknownAnswerPolicy}
                        disabled={readOnly}
                        onChange={(e) =>
                          setBehaviorRules((prev) =>
                            prev.map((x) => (x.id === rule.id ? { ...x, unknownAnswerPolicy: e.target.value } : x)),
                          )
                        }
                        placeholder="Qué hacer cuando no sabe la respuesta"
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          disabled={readOnly}
                          onChange={(e) =>
                            setBehaviorRules((prev) =>
                              prev.map((x) => (x.id === rule.id ? { ...x, enabled: e.target.checked } : x)),
                            )
                          }
                        />
                        Regla activa
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={rule.shortAnswers}
                          disabled={readOnly}
                          onChange={(e) =>
                            setBehaviorRules((prev) =>
                              prev.map((x) => (x.id === rule.id ? { ...x, shortAnswers: e.target.checked } : x)),
                            )
                          }
                        />
                        Priorizar respuestas cortas
                      </label>
                    </div>
                  </SectionCard>
                ))}
            </div>
          )}

          {!readOnly && (
            <button
              onClick={saveRules}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-opacity"
              style={{
                ...BTN_PRIMARY,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar reglas
            </button>
          )}
        </>
      )}

      {/* ── FAQ TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'faqs' && (
        <>
          <SectionCard>
            <p style={sectionTitle}>Preguntas frecuentes</p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
              Define pares pregunta–respuesta para que el modelo las use cuando la consulta sea equivalente. Al guardar,
              se integran al system prompt y se sincronizan con AIBackHub. El widget registra preguntas repetidas que
              aún no tienen FAQ: aparecen abajo como candidatas (≥3 veces) para que las conviertas en FAQ formal.
            </p>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setAgentFaqs((prev) => [...prev, createEmptyFaq()])}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-opacity"
                style={{ ...BTN_PRIMARY, cursor: 'pointer' }}
              >
                <Plus size={13} /> Agregar FAQ
              </button>
            )}
          </SectionCard>

          {agentFaqs.length === 0 ? (
            <SectionCard innerStyle={{ textAlign: 'center', padding: '28px 16px' }}>
              <HelpCircle size={24} style={{ color: 'var(--muted-foreground)', margin: '0 auto 8px' }} />
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', margin: 0 }}>
                Sin FAQs aún. Añade la primera o espera a que aparezcan candidatas desde el widget.
              </p>
            </SectionCard>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {agentFaqs
                .slice()
                .sort((a, b) => a.priority - b.priority)
                .map((faq) => (
                  <SectionCard key={faq.id} outerStyle={{ borderColor: 'rgba(0,172,248,0.22)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>FAQ</p>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => setAgentFaqs((prev) => prev.filter((x) => x.id !== faq.id))}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 8,
                            border: '1px solid rgba(239,68,68,0.35)',
                            background: 'rgba(239,68,68,0.08)',
                            color: '#ef4444',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="landing-input"
                          style={{ ...inp, paddingRight: readOnly ? undefined : '36px' }}
                          value={faq.question}
                          disabled={readOnly}
                          placeholder="Pregunta que hace el usuario"
                          onChange={(e) =>
                            setAgentFaqs((prev) =>
                              prev.map((x) => (x.id === faq.id ? { ...x, question: e.target.value } : x)),
                            )
                          }
                        />
                        {!readOnly && <AIInputButton fieldType="faq_question" fieldName="Pregunta FAQ" agentContext={{ name, purpose: description }} onResult={(t) => setAgentFaqs((prev) => prev.map((x) => (x.id === faq.id ? { ...x, question: t } : x)))} />}
                      </div>
                      <input
                        className="landing-input"
                        style={inp}
                        type="number"
                        min={0}
                        max={1000}
                        value={String(faq.priority)}
                        disabled={readOnly}
                        placeholder="Prioridad"
                        onChange={(e) =>
                          setAgentFaqs((prev) =>
                            prev.map((x) =>
                              x.id === faq.id
                                ? { ...x, priority: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) }
                                : x,
                            ),
                          )
                        }
                      />
                    </div>
                    <div style={{ position: 'relative', marginTop: 10 }}>
                      <textarea
                        className="landing-input"
                        style={{ ...inp, minHeight: 88, resize: 'vertical', fontFamily: 'inherit', paddingRight: readOnly ? undefined : '36px' }}
                        value={faq.answer}
                        disabled={readOnly}
                        placeholder="Respuesta canónica del agente"
                        onChange={(e) =>
                          setAgentFaqs((prev) =>
                            prev.map((x) => (x.id === faq.id ? { ...x, answer: e.target.value } : x)),
                          )
                        }
                      />
                      {!readOnly && <AIInputButton fieldType="faq_answer" fieldName="Respuesta FAQ" agentContext={{ name, purpose: description }} onResult={(t) => setAgentFaqs((prev) => prev.map((x) => (x.id === faq.id ? { ...x, answer: t } : x)))} position="right-top" />}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={faq.enabled}
                        disabled={readOnly}
                        onChange={(e) =>
                          setAgentFaqs((prev) =>
                            prev.map((x) => (x.id === faq.id ? { ...x, enabled: e.target.checked } : x)),
                          )
                        }
                      />
                      FAQ activa
                    </label>
                  </SectionCard>
                ))}
            </div>
          )}

          <SectionCard>
            <p style={sectionTitle}>Candidatas (desde el widget)</p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '10px', lineHeight: 1.45 }}>
              Preguntas que los visitantes repiten y que no coinciden con ninguna FAQ por texto normalizado. Tras{' '}
              <strong>3</strong> repeticiones se sugieren al modelo como contexto; conviértelas en FAQ para fijar la
              respuesta.
            </p>
            {faqCandidates.filter((c) => !c.dismissed).length === 0 ? (
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', margin: 0 }}>
                Aún no hay candidatas. Usa el widget con este agente: se irán acumulando aquí.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {faqCandidates
                  .filter((c) => !c.dismissed)
                  .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
                  .map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'rgba(0,172,248,0.05)',
                        fontSize: 13,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: R }}>×{c.count}</span>
                        {!readOnly && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="text-xs font-bold px-2 py-1 rounded-lg border"
                              style={{ borderColor: `${B}55`, color: B, cursor: 'pointer', background: 'rgba(0,172,248,0.08)' }}
                              onClick={() => {
                                const q = c.questionSample.trim();
                                if (!q) return;
                                setAgentFaqs((prev) => [
                                  ...prev,
                                  {
                                    id: crypto.randomUUID(),
                                    question: q.slice(0, 500),
                                    answer: '',
                                    enabled: true,
                                    priority: 50,
                                  },
                                ]);
                                setFaqCandidates((prev) =>
                                  prev.map((x) => (x.id === c.id ? { ...x, dismissed: true } : x)),
                                );
                              }}
                            >
                              Crear FAQ
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold px-2 py-1 rounded-lg border"
                              style={{
                                borderColor: 'var(--border)',
                                cursor: 'pointer',
                                color: 'var(--muted-foreground)',
                              }}
                              onClick={() =>
                                setFaqCandidates((prev) =>
                                  prev.map((x) => (x.id === c.id ? { ...x, dismissed: true } : x)),
                                )
                              }
                            >
                              Ocultar
                            </button>
                          </div>
                        )}
                      </div>
                      <p style={{ margin: '8px 0 0', lineHeight: 1.4, color: 'var(--foreground)' }}>{c.questionSample}</p>
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
                        Última vez: {c.lastSeen ? new Date(c.lastSeen).toLocaleString('es') : '—'}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </SectionCard>

          {!readOnly && (
            <button
              onClick={saveFaqs}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-opacity"
              style={{
                ...BTN_PRIMARY,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar FAQs
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
                    const icon = mcpIntegrationIcon(srv.integrationKey);
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
                <p style={{ color: 'var(--muted-foreground)', fontSize: '12px', margin: '0 0 12px', lineHeight: 1.5 }}>
                  Usa el formulario de arriba para conectar Gmail, calendario, HubSpot, etc. Cada agente puede tener su propia cuenta o credenciales.
                </p>
                <button
                  onClick={loadMcp}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: '12px', fontWeight: 500,
                    padding: '6px 14px', borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--background)', color: 'var(--foreground)',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={13} />
                  Reintentar
                </button>
            </SectionCard>
          ) : null}

          {/* Pending/Error MCP connections */}
          {pendingOrErrorMcpServers.length > 0 && (
            <SectionCard bar="bo">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <p style={{ ...sectionTitle, margin: 0 }}>Integraciones pendientes o con error</p>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                  {pendingOrErrorMcpServers.length} conexión{pendingOrErrorMcpServers.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '0 0 14px', lineHeight: 1.5 }}>
                Misma cuenta que arriba: reintenta el sync con el servidor MCP o quita la conexión. También puedes gestionarlas en AgentFlowHub.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pendingOrErrorMcpServers.map((srv) => {
                  const pb = mcpConnectionBadgeStyle(srv);
                  const pLast = formatMcpLastSync(srv.lastSyncAt);
                  const icon = mcpIntegrationIcon(srv.integrationKey);
                  const headerTint =
                    srv.syncStatus === 'error'
                      ? 'rgba(239,68,68,0.06)'
                      : 'rgba(217,119,6,0.07)';
                  return (
                    <div
                      key={srv.connectionId}
                      style={{
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'flex-start',
                          gap: '12px',
                          padding: '12px 14px',
                          background: headerTint,
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <span style={{ fontSize: '20px', lineHeight: 1, flexShrink: 0 }} aria-hidden>
                          {icon}
                        </span>
                        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                          <p style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                            {srv.serverName}
                          </p>
                          {pLast ? (
                            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
                              Último intento: {pLast}
                            </p>
                          ) : null}
                          {srv.syncStatus === 'error' && srv.lastSyncError ? (
                            <p
                              style={{
                                fontSize: '11px',
                                color: '#ef4444',
                                margin: '6px 0 0',
                                lineHeight: 1.4,
                                wordBreak: 'break-word',
                              }}
                            >
                              {srv.lastSyncError.slice(0, 320)}
                              {srv.lastSyncError.length > 320 ? '…' : ''}
                            </p>
                          ) : null}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: '8px',
                            marginLeft: 'auto',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '3px 10px',
                              borderRadius: 20,
                              background: pb.bg,
                              color: pb.color,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {pb.label}
                          </span>
                          {!readOnly && (
                            <>
                              <button
                                type="button"
                                title="Reintentar sincronización"
                                onClick={() => resyncMcpConnection(srv.connectionId)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '6px 12px',
                                  borderRadius: '8px',
                                  border: '1px solid var(--border)',
                                  background: 'var(--background)',
                                  cursor: 'pointer',
                                  color: 'var(--foreground)',
                                }}
                              >
                                <RefreshCw size={13} /> Reintentar
                              </button>
                              <button
                                type="button"
                                title="Quitar conexión"
                                onClick={() => deleteMcpConnection(srv.connectionId)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '6px 12px',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(239,68,68,0.35)',
                                  background: 'rgba(239,68,68,0.08)',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                }}
                              >
                                <Trash2 size={13} /> Quitar
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          <SectionCard bar="bo">
            <p style={{ ...sectionTitle, margin: '0 0 10px' }}>Captura automática en HubSpot</p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
              Si el visitante indica <strong>nombre</strong> y <strong>correo</strong> o un <strong>móvil colombiano</strong> (10 dígitos, ej. 300…),
              el servidor puede buscar el contacto en HubSpot y crearlo si no existe. Requiere conexión OAuth HubSpot en estado ok y las herramientas
              <code style={{ fontSize: '10px' }}> hubspot_search_contacts</code> y <code style={{ fontSize: '10px' }}> hubspot_create_contact</code> activas arriba.
            </p>
            {!hubspotWidgetAutoCaptureEligible ? (
              <p style={{ fontSize: '11px', color: '#d97706', margin: 0, lineHeight: 1.45 }}>
                Activa ambas herramientas HubSpot de la lista para poder usar esta opción.
              </p>
            ) : null}
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: readOnly || !hubspotWidgetAutoCaptureEligible ? 'default' : 'pointer' }}>
              <div
                onClick={() =>
                  !readOnly &&
                  hubspotWidgetAutoCaptureEligible &&
                  setHubspotAutoCaptureContacts((prev) => !prev)
                }
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  position: 'relative',
                  cursor: readOnly || !hubspotWidgetAutoCaptureEligible ? 'not-allowed' : 'pointer',
                  background:
                    hubspotAutoCaptureContacts && hubspotWidgetAutoCaptureEligible
                      ? `linear-gradient(90deg, ${R}, ${O})`
                      : 'var(--border)',
                  transition: 'background 0.2s',
                  opacity: readOnly ? 0.75 : !hubspotWidgetAutoCaptureEligible ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: hubspotAutoCaptureContacts && hubspotWidgetAutoCaptureEligible ? 21 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                  }}
                />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                {hubspotAutoCaptureContacts && hubspotWidgetAutoCaptureEligible
                  ? 'Captura automática activada'
                  : 'Captura automática desactivada'}
              </span>
            </label>
            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '10px', marginBottom: 0 }}>
              Pulsa <strong>Guardar herramientas</strong> para sincronizar con AIBackHub.
            </p>
          </SectionCard>

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
                  {!readOnly && t.toolId === 'webhook' && (
                    <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '0 0 10px', lineHeight: 1.45 }}>
                        El motor envía un POST automático al guardar un turno con <strong>correo</strong> o <strong>celular colombiano</strong> (10 dígitos, ej. 300…)
                        en el mismo mensaje, además de cuando el visitante pide confirmar el envío. Tras editar la URL, pulsa <strong>Guardar herramientas</strong> y
                        reintenta sincronización con el hub si hiciera falta.
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '0 0 10px', lineHeight: 1.45 }}>
                        En el chat el modelo puede escribir JSON sin llamar a tu URL. Esta prueba envía un POST real
                        desde el servidor con la configuración <strong>ya guardada</strong> (pulsa Guardar herramientas antes si cambiaste la URL).
                      </p>
                      <button
                        type="button"
                        onClick={testSavedWebhook}
                        disabled={webhookTestBusy}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-opacity"
                        style={{
                          border: `1px solid ${B}`,
                          background: 'rgba(0,172,248,0.08)',
                          color: B,
                          cursor: webhookTestBusy ? 'not-allowed' : 'pointer',
                          opacity: webhookTestBusy ? 0.7 : 1,
                        }}
                      >
                        {webhookTestBusy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                        Probar webhook (POST de prueba)
                      </button>
                    </div>
                  )}
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
                <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginBottom: '10px' }}>
                  Sube archivos o agrega texto/URLs para que el agente responda con información precisa de tu negocio.
                  Soporta PDF, Word, imágenes (OCR automático), TXT, CSV, JSON y más. Los archivos se convierten a texto
                  antes de indexarse: conviene títulos claros, bloques cortos y etiquetas repetibles (SKU, política, paso).
                </p>
                <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '14px', lineHeight: 1.45 }}>
                  Descarga una plantilla de ejemplo por formato; edítala en tu equipo y súbela aquí cuando esté lista.
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
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '10px',
                        marginBottom: '14px',
                        fontSize: '11px',
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      <div style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}>
                        <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--foreground)' }}>Plan</p>
                        <p style={{ margin: 0 }}>{plan} · RAG {limits.ragEnabled ? 'incluido' : '—'}</p>
                      </div>
                      <div style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}>
                        <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--foreground)' }}>Fuentes</p>
                        <p style={{ margin: 0 }}>{ragSources.length} / {ragMaxSources}</p>
                      </div>
                      <div style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}>
                        <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--foreground)' }}>Archivo</p>
                        <p style={{ margin: 0 }}>Máx. {RAG_MAX_FILE_MB} MB · ~{RAG_MAX_EXTRACTED_CHARS.toLocaleString('es')} caracteres extraídos por archivo</p>
                      </div>
                      {limits.ragStorageMbPerAgent > 0 ? (
                        <div style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}>
                          <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--foreground)' }}>Almacenamiento</p>
                          <p style={{ margin: 0 }}>
                            {(ragUsage.bytes / 1024 / 1024).toFixed(2)} / {limits.ragStorageMbPerAgent} MB
                          </p>
                        </div>
                      ) : null}
                      <div style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}>
                        <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--foreground)' }}>Caracteres (aprox.)</p>
                        <p style={{ margin: 0 }}>{ragUsage.chars.toLocaleString('es')} en todas las fuentes</p>
                      </div>
                    </div>
                    <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: '0 0 12px', lineHeight: 1.45 }}>
                      Las subidas quedan vinculadas a tu sesión y a este agente. Para OCR útil en imágenes, usa fotos nítidas con texto grande y buena luz.
                      {' '}
                      <Link href="/docs" className="landing-link-accent no-underline font-semibold">Guía breve en Docs →</Link>
                    </p>
                    {plan === 'starter' && (
                      <p style={{ fontSize: '11px', color: '#d97706', margin: '0 0 12px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)' }}>
                        Plan Starter: prioriza pocas fuentes bien estructuradas antes de subir muchos archivos pequeños duplicados.
                      </p>
                    )}

                    {/* Drag-and-drop zone */}
                    <div
                      role="region"
                      aria-label="Zona para subir archivos al conocimiento del agente"
                      tabIndex={readOnly ? -1 : 0}
                      onKeyDown={(e) => {
                        if (readOnly) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          document.getElementById('rag-file-input')?.click();
                        }
                      }}
                      onDragOver={(e) => { if (!readOnly) { e.preventDefault(); setDragOver(true); } }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={readOnly ? undefined : handleFileDrop}
                      style={{
                        border: `2px dashed ${dragOver ? R : 'var(--border)'}`,
                        borderRadius: '12px', padding: '32px 20px', textAlign: 'center',
                        background: dragOver ? 'rgba(228,20,20,0.05)' : 'transparent',
                        transition: 'all 0.15s', cursor: readOnly ? 'not-allowed' : 'pointer', marginBottom: '14px',
                        pointerEvents: readOnly ? 'none' : 'auto', opacity: readOnly ? 0.65 : 1,
                        outline: 'none',
                      }}
                      className="focus-visible:ring-2 focus-visible:ring-offset-2"
                      onClick={() => !readOnly && document.getElementById('rag-file-input')?.click()}
                    >
                      <input
                        id="rag-file-input"
                        type="file"
                        multiple
                        style={{ display: 'none' }}
                        accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif"
                        onChange={handleFileInput}
                      />
                      {ragUploadProgress ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <Loader2 size={28} className="animate-spin" style={{ color: R }} />
                          <p style={{ color: R, fontSize: '13px', fontWeight: 600 }}>
                            Subiendo {ragUploadProgress.current}/{ragUploadProgress.total}: {ragUploadProgress.fileName}
                          </p>
                        </div>
                      ) : (
                        <>
                          <Upload size={28} style={{ color: dragOver ? R : 'var(--muted-foreground)', margin: '0 auto 10px' }} />
                          <p style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>
                            Arrastra uno o varios archivos, o haz clic para seleccionar
                          </p>
                          <p style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                            PDF · DOCX · TXT · CSV · JSON · PNG · JPG · WEBP — máx. {RAG_MAX_FILE_MB} MB por archivo
                          </p>
                        </>
                      )}
                    </div>

                    {/* Descargar plantillas de ejemplo (public/assets/exampleRAG) */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {RAG_EXAMPLE_DOWNLOADS.map((row) => (
                        <button
                          key={row.file}
                          type="button"
                          onClick={() => triggerRagExampleDownload(row.file)}
                          title={`Descargar ${row.file}`}
                          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                          style={{
                            fontSize: '11px',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            border: '1px solid color-mix(in srgb, var(--foreground) 14%, var(--border))',
                            background: 'var(--card)',
                            color: 'var(--foreground)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <span aria-hidden>{row.icon}</span> {row.label}
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: '0 0 10px', lineHeight: 1.4 }}>
                      La plantilla PNG es mínima (prueba de subida). Para OCR real, sube capturas con texto legible y resolución suficiente.
                    </p>

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

                  {/* ── Scraping de URL ─────────────────────────────────── */}
                  {!readOnly && (
                    <SectionCard bar="bo">
                      <p style={sectionTitle}>Scraping de URL con IA (BETA)</p>
                      <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginBottom: '12px' }}>
                        Extrae el contenido de cualquier página web y segméntalo automáticamente con IA para agregarlo al RAG.
                      </p>

                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <input
                          className="landing-input"
                          type="url"
                          placeholder="https://ejemplo.com/pagina"
                          value={scrapeUrl}
                          onChange={(e) => setScrapeUrl(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') scrapeAndSegment(); }}
                          disabled={scrapeStatus === 'running'}
                          style={{ ...inp, flex: 1, fontSize: '13px' }}
                        />
                        <button
                          type="button"
                          onClick={scrapeAndSegment}
                          disabled={!scrapeUrl.trim() || scrapeStatus === 'running'}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs shrink-0"
                          style={{
                            ...BTN_PRIMARY,
                            cursor: (!scrapeUrl.trim() || scrapeStatus === 'running') ? 'not-allowed' : 'pointer',
                            opacity: (!scrapeUrl.trim() || scrapeStatus === 'running') ? 0.6 : 1,
                          }}
                        >
                          {scrapeStatus === 'running' ? (
                            <><Loader2 size={13} className="animate-spin" /> Procesando…</>
                          ) : (
                            <><Link2 size={13} /> Extraer</>
                          )}
                        </button>
                      </div>

                      {scrapeStatus === 'running' && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Loader2 size={12} className="animate-spin" style={{ color: R }} />
                              {scrapeStep}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{scrapeProgress}%</span>
                          </div>
                          <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              borderRadius: '3px',
                              background: `linear-gradient(90deg, ${R}, ${O})`,
                              width: `${scrapeProgress}%`,
                              transition: 'width 0.5s ease',
                            }} />
                          </div>
                        </div>
                      )}

                      {scrapeStatus === 'error' && scrapeError && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>
                          <AlertCircle size={14} /> {scrapeError}
                          <button onClick={() => { setScrapeStatus('idle'); setScrapeError(''); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                            <X size={12} />
                          </button>
                        </div>
                      )}

                      {scrapeStatus === 'done' && scrapeBlocks && scrapeBlocks.length > 0 && (
                        <div>
                          {/* Header: título + badge + botón agregar */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>
                              <CheckCircle2 size={14} style={{ display: 'inline', marginRight: '5px', color: '#22c55e' }} />
                              {scrapeBlocks.length} bloque{scrapeBlocks.length !== 1 ? 's' : ''} de <span style={{ color: B }}>{scrapeTitle}</span>
                              {scrapeExtractedBy && (
                                <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', background: scrapeExtractedBy === 'ai' ? 'rgba(34,197,94,0.1)' : 'rgba(0,172,248,0.1)', color: scrapeExtractedBy === 'ai' ? '#22c55e' : B }}>
                                  {scrapeExtractedBy === 'ai' ? '🤖 IA' : '📄 Chunk'}
                                </span>
                              )}
                            </p>
                            <button
                              type="button"
                              onClick={addScrapedBlocksToRag}
                              disabled={scrapeSelected.size === 0 || ragSources.length >= ragMaxSources}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs shrink-0"
                              style={{
                                ...BTN_PRIMARY,
                                cursor: (scrapeSelected.size === 0 || ragSources.length >= ragMaxSources) ? 'not-allowed' : 'pointer',
                                opacity: (scrapeSelected.size === 0 || ragSources.length >= ragMaxSources) ? 0.5 : 1,
                              }}
                            >
                              <Plus size={12} />
                              Agregar {scrapeSelected.size} bloque{scrapeSelected.size !== 1 ? 's' : ''} al RAG
                            </button>
                          </div>

                          {/* Controles de selección */}
                          <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                            <button type="button" onClick={() => setScrapeSelected(new Set(scrapeBlocks.map((_, i) => i)))}
                              style={{ fontSize: '11px', color: B, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                              Seleccionar todos
                            </button>
                            <button type="button" onClick={() => setScrapeSelected(new Set())}
                              style={{ fontSize: '11px', color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                              Ninguno
                            </button>
                          </div>

                          {/* Lista de bloques */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '420px', overflowY: 'auto', paddingRight: '2px' }}>
                            {scrapeBlocks.map((block, bi) => {
                              const selected = scrapeSelected.has(bi);
                              return (
                                <div
                                  key={bi}
                                  style={{
                                    borderRadius: '8px',
                                    border: `1px solid ${selected ? R : 'var(--border)'}`,
                                    background: selected ? 'rgba(228,20,20,0.04)' : 'var(--card)',
                                    overflow: 'hidden',
                                    transition: 'border-color 0.15s, background 0.15s',
                                  }}
                                >
                                  <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {/* Checkbox */}
                                    <div
                                      onClick={() => setScrapeSelected((prev) => {
                                        const next = new Set(prev);
                                        next.has(bi) ? next.delete(bi) : next.add(bi);
                                        return next;
                                      })}
                                      style={{
                                        width: 16, height: 16, borderRadius: 4,
                                        border: `2px solid ${selected ? R : 'var(--border)'}`,
                                        background: selected ? R : 'transparent',
                                        flexShrink: 0, display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', transition: 'all 0.15s', cursor: 'pointer',
                                      }}
                                    >
                                      {selected && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                    </div>

                                    {/* Título */}
                                    <span style={{ fontSize: '12px', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {block.title}
                                    </span>

                                    {/* Badges */}
                                    <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', padding: '2px 6px', borderRadius: '4px', background: 'var(--muted)', flexShrink: 0 }}>{block.type}</span>
                                    <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', flexShrink: 0 }}>{block.content.length.toLocaleString('es')} ch</span>

                                    {/* Botón ver contenido */}
                                    <button
                                      type="button"
                                      onClick={() => setScrapePreviewBlock(bi)}
                                      title="Ver contenido"
                                      style={{ background: 'none', border: `1px solid var(--border)`, borderRadius: '5px', cursor: 'pointer', padding: '3px 6px', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, fontSize: '10px', transition: 'background 0.15s' }}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                      Ver
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Modal — renderizado via Portal fuera del DOM anidado */}
                          {scrapePreviewBlock !== null && scrapeBlocks[scrapePreviewBlock] && typeof document !== 'undefined' && createPortal((() => {
                            const bi = scrapePreviewBlock;
                            const block = scrapeBlocks[bi];
                            const selected = scrapeSelected.has(bi);
                            const editedContent = scrapeEdits.get(bi) ?? block.content;
                            const isEdited = scrapeEdits.has(bi) && scrapeEdits.get(bi) !== block.content;
                            return (
                              <div
                                onClick={(e) => { if (e.target === e.currentTarget) setScrapePreviewBlock(null); }}
                                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                              >
                                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', width: '100%', maxWidth: '700px', height: '650px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.35)', overflow: 'hidden' }}>

                                  {/* Header */}
                                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'var(--muted)', flexShrink: 0 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Bloque {bi + 1} / {scrapeBlocks.length}</span>
                                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--border)', color: 'var(--muted-foreground)' }}>{block.type}</span>
                                        <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{editedContent.length.toLocaleString('es')} ch</span>
                                        {isEdited && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(234,179,8,0.15)', color: '#ca8a04', fontWeight: 600 }}>editado</span>}
                                      </div>
                                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, lineHeight: 1.3 }}>{block.title}</p>
                                    </div>
                                    <button type="button" onClick={() => setScrapePreviewBlock(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '4px', flexShrink: 0, display: 'flex', borderRadius: '6px' }}>
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                  </div>

                                  {/* Textarea editable */}
                                  <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ padding: '8px 18px 4px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', background: 'var(--muted)', flexShrink: 0 }}>
                                      <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Edita el contenido antes de agregar al RAG</span>
                                      {isEdited && (
                                        <button type="button" onClick={() => setScrapeEdits((prev) => { const m = new Map(prev); m.delete(bi); return m; })} style={{ fontSize: '10px', color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                                          Restaurar original
                                        </button>
                                      )}
                                    </div>
                                    <textarea
                                      value={editedContent}
                                      onChange={(e) => setScrapeEdits((prev) => new Map(prev).set(bi, e.target.value))}
                                      spellCheck={false}
                                      style={{ flex: 1, width: '100%', border: 'none', outline: 'none', resize: 'none', padding: '16px 18px', fontSize: '12px', lineHeight: 1.7, fontFamily: 'inherit', color: 'var(--foreground)', background: 'var(--card)', boxSizing: 'border-box' }}
                                    />
                                  </div>

                                  {/* Footer */}
                                  <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: 'var(--muted)', flexShrink: 0 }}>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <button type="button" onClick={() => setScrapePreviewBlock(bi > 0 ? bi - 1 : scrapeBlocks.length - 1)} style={{ fontSize: '11px', padding: '6px 11px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                                        Anterior
                                      </button>
                                      <button type="button" onClick={() => setScrapePreviewBlock(bi < scrapeBlocks.length - 1 ? bi + 1 : 0)} style={{ fontSize: '11px', padding: '6px 11px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        Siguiente
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setScrapeSelected((prev) => { const next = new Set(prev); next.has(bi) ? next.delete(bi) : next.add(bi); return next; })}
                                      style={{ fontSize: '12px', padding: '7px 16px', borderRadius: '7px', border: `1px solid ${selected ? R : 'var(--border)'}`, background: selected ? R : 'var(--card)', color: selected ? 'white' : 'var(--foreground)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' }}
                                    >
                                      {selected
                                        ? <><svg width="12" height="12" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Incluido</>
                                        : '+ Incluir en RAG'
                                      }
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })(), document.body)}

                          <button
                            type="button"
                            onClick={() => { setScrapeStatus('idle'); setScrapeBlocks(null); setScrapeSelected(new Set()); setScrapePreviewBlock(null); setScrapeEdits(new Map()); setScrapeUrl(''); setScrapeStep(''); setScrapeTitle(''); }}
                            style={{ marginTop: '10px', fontSize: '11px', color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            Limpiar resultado
                          </button>
                        </div>
                      )}
                    </SectionCard>
                  )}

                  {agent?.agentHubId && agent.syncStatus === 'failed' && (
                    <div
                      style={{
                        marginBottom: '12px',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: '1px solid rgba(239,68,68,0.35)',
                        background: 'rgba(239,68,68,0.06)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '10px',
                        justifyContent: 'space-between',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>
                        El catálogo en el hub no se actualizó tras el último cambio. El widget puede servir datos antiguos hasta que se sincronice.
                      </p>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={retryRagHubSync}
                          disabled={ragRetryHubBusy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold shrink-0"
                          style={{
                            borderColor: 'var(--border)',
                            background: 'var(--card)',
                            cursor: ragRetryHubBusy ? 'wait' : 'pointer',
                          }}
                        >
                          {ragRetryHubBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                          Reintentar sync hub
                        </button>
                      )}
                    </div>
                  )}

                  {/* Sources list */}
                  <SectionCard>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <p style={{ ...sectionTitle, margin: 0 }}>
                            Fuentes ({ragSources.length}/{ragMaxSources})
                          </p>
                          {agent?.agentHubId ? (
                            <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
                              Hub catálogo:{' '}
                              <span style={{
                                fontWeight: 700,
                                color: agent.syncStatus === 'synced' ? '#22c55e' : agent.syncStatus === 'failed' ? '#ef4444' : '#d97706',
                              }}>
                                {agent.syncStatus === 'synced' ? 'sincronizado' : agent.syncStatus === 'failed' ? 'error' : 'pendiente'}
                              </span>
                            </p>
                          ) : (
                            <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
                              Sin ID de hub aún; se creará al sincronizar.
                            </p>
                          )}
                        </div>
                        <button onClick={addRagSource} style={{
                          display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px',
                          borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent',
                          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        }}>
                          <Plus size={12} /> Agregar texto/URL
                        </button>
                      </div>
                      {ragSources.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 180px', minWidth: 0 }}>
                            <Search size={14} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                            <input
                              className="landing-input"
                              type="search"
                              placeholder="Buscar por nombre o contenido…"
                              value={ragSourceQuery}
                              onChange={(e) => setRagSourceQuery(e.target.value)}
                              style={{ ...inp, padding: '8px 12px', fontSize: '12px', flex: 1, minWidth: 0 }}
                              aria-label="Filtrar fuentes RAG"
                            />
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                            Orden
                            <select
                              value={ragSourceSort}
                              onChange={(e) => setRagSourceSort(e.target.value as 'order' | 'name' | 'size' | 'chars')}
                              className="landing-input"
                              style={{ ...inp, width: 'auto', padding: '6px 10px', fontSize: '12px' }}
                            >
                              <option value="order">Orden guardado</option>
                              <option value="name">Nombre</option>
                              <option value="size">Tamaño archivo</option>
                              <option value="chars">Caracteres</option>
                            </select>
                          </label>
                        </div>
                      )}
                    </div>

                    {ragSources.length === 0 ? (
                      <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
                        Sin fuentes aún. Sube un archivo o agrega texto/URL.
                      </p>
                    ) : displayRagEntries.length === 0 ? (
                      <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
                        Ninguna fuente coincide con la búsqueda. Ajusta el filtro o el orden.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {displayRagEntries.map(({ src, i }) => {
                          if (src.type === 'file') {
                            // File source — read-only display
                            const catIcon: Record<string, ReactNode> = {
                              pdf: <FileText size={16} style={{ color: '#ef4444' }} />,
                              docx: <FileText size={16} style={{ color: R }} />,
                              image: <ImageIcon size={16} style={{ color: '#f59e0b' }} />,
                              text: <AlignLeft size={16} style={{ color: B }} />,
                            };
                            return (
                              <div key={src.fileId ?? `file-${i}`} style={{
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
                                    <span style={{ fontWeight: 600, color: B }}>Archivo</span>
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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                                  {Boolean(src.content && String(src.content).length > 0) && (
                                    <button
                                      type="button"
                                      onClick={() => openRagPreviewFromSource(src)}
                                      title="Vista previa del texto extraído"
                                      className="focus-visible:outline-none focus-visible:ring-2 rounded-md"
                                      style={{
                                        padding: '6px', borderRadius: '6px',
                                        border: '1px solid var(--border)', background: 'var(--card)', color: B, cursor: 'pointer',
                                      }}
                                    >
                                      <Eye size={12} />
                                    </button>
                                  )}
                                  {!readOnly && ragSources.length < ragMaxSources && (
                                    <button
                                      type="button"
                                      onClick={() => duplicateRagSourceAt(i)}
                                      title="Duplicar como fuente de texto (edita el nombre después)"
                                      className="focus-visible:outline-none focus-visible:ring-2 rounded-md"
                                      style={{
                                        padding: '6px', borderRadius: '6px',
                                        border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer',
                                      }}
                                    >
                                      <Copy size={12} />
                                    </button>
                                  )}
                                  {!readOnly && (
                                    <button
                                      type="button"
                                      onClick={() => deleteRagSource(src, i)}
                                      title="Eliminar"
                                      className="focus-visible:outline-none focus-visible:ring-2 rounded-md"
                                      style={{
                                        padding: '6px', borderRadius: '6px',
                                        border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)',
                                        color: '#ef4444', cursor: 'pointer',
                                      }}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          // Manual text / URL source — editable
                          return (
                            <div key={`manual-${i}`} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                                  style={{ ...inp, flex: 1, fontSize: '12px', padding: '6px 10px', minWidth: '120px' }}
                                  value={src.name}
                                  onChange={(e) => setRagSources((prev) => prev.map((s, idx) => idx === i ? { ...s, name: e.target.value } : s))}
                                  placeholder="Nombre (ej: FAQ empresa)"
                                  disabled={readOnly}
                                />
                                <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: 'auto' }}>
                                  {Boolean(src.content && String(src.content).trim().length > 0) && (
                                    <button
                                      type="button"
                                      onClick={() => openRagPreviewFromSource(src)}
                                      title="Vista previa"
                                      className="focus-visible:outline-none focus-visible:ring-2 rounded-md"
                                      style={{
                                        padding: '6px', borderRadius: '6px',
                                        border: '1px solid var(--border)', background: 'var(--card)', color: B, cursor: 'pointer',
                                      }}
                                    >
                                      <Eye size={12} />
                                    </button>
                                  )}
                                  {!readOnly && ragSources.length < ragMaxSources && (
                                    <button
                                      type="button"
                                      onClick={() => duplicateRagSourceAt(i)}
                                      title="Duplicar fuente"
                                      className="focus-visible:outline-none focus-visible:ring-2 rounded-md"
                                      style={{
                                        padding: '6px', borderRadius: '6px',
                                        border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer',
                                      }}
                                    >
                                      <Copy size={12} />
                                    </button>
                                  )}
                                  {!readOnly && (
                                    <button
                                      type="button"
                                      onClick={() => deleteRagSource(src, i)}
                                      title="Eliminar"
                                      className="focus-visible:outline-none focus-visible:ring-2 rounded-md"
                                      style={{
                                        padding: '6px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)',
                                        background: 'rgba(239,68,68,0.06)', color: '#ef4444', cursor: 'pointer',
                                      }}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
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

                  {ragPreview ? (
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="rag-preview-title"
                      style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 70,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                      }}
                      onClick={() => setRagPreview(null)}
                    >
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          maxWidth: '760px',
                          width: '100%',
                          maxHeight: '88vh',
                          overflow: 'auto',
                          borderRadius: '16px',
                          background: 'var(--card)',
                          border: '1px solid var(--border)',
                          padding: '20px',
                          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                          <h2 id="rag-preview-title" style={{ fontSize: '16px', fontWeight: 800, margin: 0, lineHeight: 1.3 }}>
                            {ragPreview.title}
                          </h2>
                          <button
                            type="button"
                            onClick={() => setRagPreview(null)}
                            aria-label="Cerrar vista previa"
                            style={{
                              border: 'none',
                              background: 'transparent',
                              fontSize: '22px',
                              lineHeight: 1,
                              cursor: 'pointer',
                              color: 'var(--muted-foreground)',
                              padding: '4px 8px',
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '0 0 12px' }}>
                          {ragPreview.totalChars.toLocaleString('es')} caracteres · fragmento para revisión (Esc cierra)
                        </p>
                        <pre
                          style={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontSize: '11px',
                            lineHeight: 1.45,
                            padding: '12px',
                            borderRadius: '10px',
                            background: 'var(--muted)',
                            border: '1px solid var(--border)',
                            margin: 0,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          }}
                        >
                          {ragPreview.snippet}
                        </pre>
                        <button
                          type="button"
                          onClick={() => setRagPreview(null)}
                          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs"
                          style={{ border: `1px solid ${B}`, background: 'rgba(0,172,248,0.08)', color: B, cursor: 'pointer' }}
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  ) : null}
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
                    <input
                      className="landing-input"
                      style={inp}
                      value={subName}
                      onChange={(e) => setSubName(e.target.value)}
                      placeholder="Nombre del sub-agente (ej: Especialista en facturación)"
                      required
                      aria-label="Nombre del sub-agente"
                    />
                    <select className="landing-input" style={inp} value={subModel} onChange={(e) => setSubModel(e.target.value)}>
                      {displayModels.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
                    </select>
                    <textarea
                      className="landing-input"
                      style={{ ...inp, minHeight: '100px', resize: 'vertical', fontFamily: 'inherit' }}
                      value={subPrompt}
                      onChange={(e) => setSubPrompt(e.target.value)}
                      placeholder="System prompt del sub-agente: Define su especialización específica..."
                      required
                      aria-label="System prompt del sub-agente"
                    />
                    {(!subName.trim() || !subPrompt.trim()) && (
                      <p
                        style={{
                          fontSize: '12px',
                          color: 'var(--muted-foreground)',
                          margin: 0,
                          lineHeight: 1.45,
                        }}
                      >
                        <strong>Crear</strong> se habilita cuando hay{' '}
                        {!subName.trim() && !subPrompt.trim()
                          ? 'nombre y system prompt'
                          : !subName.trim()
                            ? 'nombre del sub-agente'
                            : 'system prompt (texto no vacío)'}
                        . Ambos son obligatorios para evitar sub-agentes sin instrucciones.
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={createSubAgent}
                        disabled={creatingSubAgent || !subName.trim() || !subPrompt.trim()}
                        title={
                          !subName.trim() || !subPrompt.trim()
                            ? 'Completa nombre y system prompt'
                            : undefined
                        }
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-opacity"
                        style={{
                          ...BTN_PRIMARY,
                          cursor:
                            creatingSubAgent || !subName.trim() || !subPrompt.trim()
                              ? 'not-allowed'
                              : 'pointer',
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

      {/* ── VOICE TAB ────────────────────────────────────────────────────────── */}
      {tab === 'voice' && (
        <VoicePickerTab
          selected={widgetVoiceName}
          onSelect={setWidgetVoiceName}
          onSave={saveVoice}
          saving={saving}
          readOnly={readOnly}
          accentColor={R}
          inp={inp}
          sectionTitle={sectionTitle}
        />
      )}

      </div>
    </div>
  );
}

// ── VoicePickerTab ────────────────────────────────────────────────────────────

interface VoicePickerTabProps {
  selected: string;
  onSelect: (name: string) => void;
  onSave: () => void;
  saving: boolean;
  readOnly: boolean;
  accentColor: string;
  inp: CSSProperties;
  sectionTitle: CSSProperties;
}

function VoicePickerTab({ selected, onSelect, onSave, saving, readOnly, accentColor, inp, sectionTitle }: VoicePickerTabProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [query, setQuery] = useState('');
  const [playingName, setPlayingName] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function load() {
      const v = window.speechSynthesis?.getVoices() ?? [];
      if (v.length) setVoices(v);
    }
    load();
    window.speechSynthesis?.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load);
  }, []);

  function stopPreview() {
    window.speechSynthesis?.cancel();
    if (timerRef.current) clearTimeout(timerRef.current);
    setPlayingName(null);
  }

  function playPreview(voice: SpeechSynthesisVoice) {
    stopPreview();
    const utter = new SpeechSynthesisUtterance('Hola, soy tu asistente de voz. ¿En qué te puedo ayudar hoy?');
    utter.voice = voice;
    utter.lang = voice.lang;
    utter.rate = 1;
    utter.onend = () => setPlayingName(null);
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utter);
    setPlayingName(voice.name);
    timerRef.current = setTimeout(() => {
      window.speechSynthesis?.cancel();
      setPlayingName(null);
    }, 6000);
  }

  useEffect(() => () => stopPreview(), []);

  const filtered = voices.filter((v) => {
    const q = query.toLowerCase();
    return !q || v.name.toLowerCase().includes(q) || v.lang.toLowerCase().includes(q);
  });

  return (
    <>
      <SectionCard>
        <p style={sectionTitle}><Volume2 size={13} style={{ display: 'inline', marginRight: 6 }} />Voz del widget</p>
        <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '14px', lineHeight: 1.45 }}>
          Elige la voz que usará el widget cuando lea respuestas en voz alta. Las voces disponibles dependen del navegador y sistema operativo del usuario.
          {!voices.length && <span style={{ color: '#d97706' }}> (Cargando voces — abre este panel en un navegador compatible con síntesis de voz.)</span>}
        </p>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none' }} />
          <input
            className="landing-input"
            style={{ ...inp, paddingLeft: 30 }}
            placeholder="Buscar por nombre o idioma…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={readOnly}
          />
        </div>

        {/* Voice list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto' }}>
          {/* Auto option */}
          <VoiceRow
            name="— Automático (recomendado) —"
            lang=""
            isSelected={!selected}
            isPlaying={false}
            onSelect={() => !readOnly && onSelect('')}
            onPlay={null}
            accentColor={accentColor}
          />
          {filtered.map((v) => (
            <VoiceRow
              key={v.name}
              name={v.name}
              lang={v.lang}
              isSelected={selected === v.name}
              isPlaying={playingName === v.name}
              onSelect={() => !readOnly && onSelect(v.name)}
              onPlay={() => playPreview(v)}
              accentColor={accentColor}
            />
          ))}
          {voices.length > 0 && filtered.length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '16px 0' }}>
              Sin resultados para &ldquo;{query}&rdquo;
            </p>
          )}
        </div>
      </SectionCard>

      {!readOnly && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              padding: '10px 20px', borderRadius: '12px', fontWeight: 700, fontSize: '13px',
              background: accentColor, color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar voz
          </button>
        </div>
      )}
    </>
  );
}

interface VoiceRowProps {
  name: string;
  lang: string;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  onPlay: (() => void) | null;
  accentColor: string;
}

function VoiceRow({ name, lang, isSelected, isPlaying, onSelect, onPlay, accentColor }: VoiceRowProps) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
        border: `1px solid ${isSelected ? accentColor + '55' : 'var(--border)'}`,
        background: isSelected ? accentColor + '0d' : 'var(--background)',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${isSelected ? accentColor : 'var(--border)'}`,
        background: isSelected ? accentColor : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: isSelected ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
        {lang && <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted-foreground)' }}>{lang}</p>}
      </div>

      {onPlay && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
          title={isPlaying ? 'Detener' : 'Escuchar (6 s)'}
          style={{
            flexShrink: 0, padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border)',
            background: isPlaying ? accentColor + '18' : 'var(--background)',
            color: isPlaying ? accentColor : 'var(--muted-foreground)',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '11px', fontWeight: 600,
          }}
        >
          {isPlaying ? <Square size={11} /> : <Play size={11} />}
          {isPlaying ? 'Stop' : 'Play'}
        </button>
      )}
    </div>
  );
}
