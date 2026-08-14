'use client';

import {
  useEffect, useState, use, useMemo, useCallback, useRef,
  type CSSProperties, type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useSubscription } from '@/hooks/use-subscription';
import { useAuth } from '@/hooks/use-auth';
import { useAgentDetailTab } from '@/hooks/use-agent-detail-tab';
import { useClientModels, mergeSavedModelOptions } from '@/hooks/use-client-models';
import { TOOLS, getAgentLimits, TOOL_MAP } from '@/lib/agent-plans';
import {
  extractWebhookEntries, generateWebhookId, sanitizeWebhookName,
  type WebhookEntry,
} from '@/lib/agent-webhooks';
import {
  extractSheetEntries, generateSheetId, sanitizeSheetName,
  type SheetEntry,
} from '@/lib/agent-sheets';
import {
  isSoloChatOnlyPlan,
  canUseWhatsApp,
  sheetNightlySyncEnabled,
  SHEET_SYNC_USD_PER_GB,
} from '@/lib/plan-catalog';
import {
  buildSkillConfigEntry,
  countEnabledSkills,
  isSkillEnabled,
  normalizeAgentSkillsState,
  skillsConfigForSave,
  SKILL_CATEGORY_LABELS,
  type AgentSkillCatalogEntry,
  type SkillConfigRow,
} from '@/lib/agent-skills-catalog';
import {
  Bot, ChevronLeft, Save, Loader2, Plus, Trash2, Network,
  Zap, Wrench, Settings, Lock, CircleOff, Upload, FileText,
  Image as ImageIcon, File, Link2, AlignLeft, CheckCircle2,
  AlertCircle, X, KeyRound, RefreshCw, Sparkles, HelpCircle,
  Phone, MessageCircle, Check,
  Copy, Eye, Search, Clock, Lightbulb,
} from '@/components/ui/icons';
import ScheduledTasksTab from '@/components/agents/ScheduledTasksTab';
import WhatsAppTab from '@/components/agents/WhatsAppTab';
import { GoogleSheetEntryCard } from '@/components/agents/google-sheet-entry-card';
import {
  stripManagedFaqPrompt,
  buildFaqPromptBlock,
  type AgentFaqRow,
  type FaqCandidateRow,
} from '@/lib/agent-faq-utils';
import Link from 'next/link';
import { toast } from 'sonner';
import { McpLandingConnectForm } from '@/components/mcp/mcp-landing-connect-form';
import { AgentMcpOpenFromQuery } from '@/components/mcp/agent-mcp-open-from-query';
import { AgentHubspotOauthReturn } from '@/components/mcp/agent-hubspot-oauth-return';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ModelSelectionSummary } from '@/components/dashboard/model-selection-summary';
import { ModelCatalogPicker } from '@/components/dashboard/model-catalog-picker';
import { AgentFallbackPicker } from '@/components/dashboard/agent-fallback-picker';
import { useFallbackModelOptions } from '@/hooks/use-fallback-model-options';
import { AgentDetailHeader } from '@/components/dashboard/agent-detail-header';
import { type AgentDetailTabId } from '@/components/dashboard/agent-detail-tabs';
import { BuilderRail } from '@/components/dashboard/builder-rail';
import { AgentEditorSection } from '@/components/dashboard/agent-editor-section';
import { AGENT_TAB_TIPS } from '@/lib/agent-editor-tab-tips';

import { R, O, B } from '@/lib/brand-colors';

const SECTION_TITLE = 'agent-editor-section__title';
const BTN_PRIMARY: CSSProperties = {
  background: R,
  color: '#fff',
  border: 'none',
  boxShadow: '0 4px 18px rgba(var(--brand-primary-rgb),0.28)',
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

type Tab = AgentDetailTabId;

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

/** Integración del catálogo vivo AIBackHub (`/api/mcp/catalog`). */
interface McpIntegrationMeta {
  key: string;
  name: string;
  description: string;
  toolIdPrefix: string;
  needsCredentials: boolean;
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

interface ToolConfig { toolId: string; config: Record<string, unknown> }

function normalizeTools(raw: ToolConfig[] | undefined | null): ToolConfig[] {
  return (raw ?? []).map((t) => ({
    toolId: t.toolId,
    config: t.config && typeof t.config === 'object' ? t.config as Record<string, unknown> : {},
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
  fallbackModels?: string[];
  fastPathModel?: string;
  inferenceTemperature?: number | null;
  inferenceMaxTokens?: number | null;
  type: 'agent' | 'sub-agent'; status: 'active' | 'disabled';
  tools: ToolConfig[]; ragEnabled: boolean; ragSources: RagSource[];
  subAgentIds: string[]; syncStatus: string; agentHubId: string | null;
  widgetPublicToken?: string | null;
  persistConversationHistory?: boolean;
  strictPurposeOnly?: boolean;
  enabledMcpToolIds?: string[];
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
  const { user } = useAuth();
  const plan = subscription?.plan ?? 'free';
  const limits = getAgentLimits(plan);
  const soloChatOnly = isSoloChatOnlyPlan(plan);
  const sheetSyncAvailable = sheetNightlySyncEnabled(plan, subscription?.features);
  const whatsappAllowed = user?.role === 'admin' || canUseWhatsApp(
    plan,
    subscription?.status ?? 'free',
    subscription?.features,
  );
  const visibleTabIds = useMemo((): AgentDetailTabId[] => {
    if (soloChatOnly) return ['general'];
    const ids: AgentDetailTabId[] = [
      'general', 'rules', 'faqs', 'tools', 'rag', 'subagents', 'scheduled-tasks',
    ];
    if (whatsappAllowed) ids.push('whatsapp');
    return ids;
  }, [soloChatOnly, whatsappAllowed]);
  const [tab, setTab] = useAgentDetailTab(visibleTabIds, 'general');
  const [sheetSyncMeta, setSheetSyncMeta] = useState<{
    billingEnabled: boolean;
    gbStored: number;
    estimatedUsd: number;
  } | null>(null);

  const [agent, setAgent] = useState<ClientAgent | null>(null);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [scheduledTaskCount, setScheduledTaskCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
  const ragSourcesRef = useRef<RagSource[]>([]);
  useEffect(() => {
    ragSourcesRef.current = ragSources;
  }, [ragSources]);
  const [widgetPublicToken, setWidgetPublicToken] = useState('');
  const [persistConversationHistory, setPersistConversationHistory] = useState(true);
  const [strictPurposeOnly, setStrictPurposeOnly] = useState(true);
  const [inferenceTemperature, setInferenceTemperature] = useState('');
  const [inferenceMaxTokens, setInferenceMaxTokens] = useState('');
  const [fastPathModel, setFastPathModel] = useState('');
  const [fallbackModels, setFallbackModels] = useState<string[]>([]);
  const [visionEnabled, setVisionEnabled] = useState(false);
  const [visionModel, setVisionModel] = useState<'gemini-2.5-flash' | 'gemini-2.5-pro' | 'claude-vision'>('gemini-2.5-flash');
  const [visionRagOnImages, setVisionRagOnImages] = useState(true);
  const [visionAutoExtractText, setVisionAutoExtractText] = useState(true);
  const [skillsConfig, setSkillsConfig] = useState<SkillConfigRow[]>([]);
  const [skillCatalog, setSkillCatalog] = useState<AgentSkillCatalogEntry[]>([]);
  const [skillCatalogLoading, setSkillCatalogLoading] = useState(true);
  const [behaviorRules, setBehaviorRules] = useState<BehaviorRule[]>([]);
  const [agentFaqs, setAgentFaqs] = useState<AgentFaqRow[]>([]);
  const [faqCandidates, setFaqCandidates] = useState<FaqCandidateRow[]>([]);

  // MCP tools state (catálogo + conexiones vienen de AIBackHub vía /api/mcp/agent-tools)
  const [mcpServers, setMcpServers] = useState<McpServerGroup[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpToolIds, setMcpToolIds] = useState<string[]>([]);
  const [mcpAgentHubLink, setMcpAgentHubLink] = useState<AgentHubLinkInfo | null>(null);
  const [mcpIntegrations, setMcpIntegrations] = useState<McpIntegrationMeta[]>([]);
  const [unifiedCounts, setUnifiedCounts] = useState<{ mcp: number; builtin: number } | null>(null);
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
  const [memoryStats, setMemoryStats] = useState<{
    conversationMemories: number;
    vectorTotal: number;
    ragSources: number;
    activeSessionContexts: number;
    historyRetentionDays: number;
    plan: string;
  } | null>(null);
  const [memoryStatsLoading, setMemoryStatsLoading] = useState(false);

  // Sub-agent creation
  const [showNewSub, setShowNewSub] = useState(false);
  const [subName, setSubName] = useState('');
  const [subPrompt, setSubPrompt] = useState('');
  const [subModel, setSubModel] = useState('gemini-2.5-flash');
  const [creatingSubAgent, setCreatingSubAgent] = useState(false);

  const { models: clientModels, hubError: modelsHubError } = useClientModels(plan);
  const {
    models: hfFallbackCatalog,
    loading: hfFallbackLoading,
    error: hfFallbackError,
    adminRestricted: hfAdminRestricted,
    planHasFallbacks: hfPlanHasFallbacks,
  } = useFallbackModelOptions(fallbackModels);
  const displayModels = useMemo(
    () => mergeSavedModelOptions(clientModels, model, subModel),
    [clientModels, model, subModel],
  );
  const summaryModels = useMemo(
    () => mergeSavedModelOptions(displayModels, ...fallbackModels, ...hfFallbackCatalog.map((m) => m.id)),
    [displayModels, fallbackModels, hfFallbackCatalog],
  );
  const mainModelUnknown = useMemo(
    () => Boolean(model.trim()) && !displayModels.some((x) => x.id === model),
    [displayModels, model],
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
    if (tab !== 'tools' || !sheetSyncAvailable) return;
    fetch('/api/billing/sheet-sync-usage', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || typeof j !== 'object') return;
        setSheetSyncMeta({
          billingEnabled: Boolean((j as { billingEnabled?: boolean }).billingEnabled),
          gbStored: typeof (j as { gbStored?: number }).gbStored === 'number' ? (j as { gbStored: number }).gbStored : 0,
          estimatedUsd: typeof (j as { estimatedUsd?: number }).estimatedUsd === 'number' ? (j as { estimatedUsd: number }).estimatedUsd : 0,
        });
      })
      .catch(() => {});
  }, [tab, sheetSyncAvailable]);

  useEffect(() => {
    if (tab !== 'rag' || !id) return;
    let cancelled = false;
    setMemoryStatsLoading(true);
    fetch(`/api/agents/${id}/memory-stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.conversationMemories === 'number') {
          setMemoryStats(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMemoryStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, id]);

  useEffect(() => {
    let cancelled = false;
    setSkillCatalogLoading(true);
    fetch('/api/skills/catalog')
      .then((r) => r.json())
      .then((data: { catalog?: AgentSkillCatalogEntry[] }) => {
        if (cancelled) return;
        setSkillCatalog(Array.isArray(data.catalog) ? data.catalog : []);
      })
      .catch(() => {
        if (!cancelled) setSkillCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setSkillCatalogLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!agent || skillCatalog.length === 0) return;
    setSkillsConfig(
      normalizeAgentSkillsState(
        skillCatalog,
        Array.isArray(agent.skills) ? agent.skills : [],
        Array.isArray(agent.skillsConfig) ? agent.skillsConfig : [],
      ),
    );
  }, [agent, skillCatalog]);

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
        setFallbackModels(Array.isArray(a.fallbackModels) ? a.fallbackModels.filter(Boolean) : []);
        setTools(normalizeTools(a.tools));
        setRagEnabled(a.ragEnabled);
        setRagSources(a.ragSources ?? []);
        setWidgetPublicToken(typeof a.widgetPublicToken === 'string' ? a.widgetPublicToken : '');
        setPersistConversationHistory(
          typeof a.persistConversationHistory === 'boolean' ? a.persistConversationHistory : true,
        );
        setStrictPurposeOnly(a.strictPurposeOnly !== false);
        setInferenceTemperature(
          typeof a.inferenceTemperature === 'number' ? String(a.inferenceTemperature) : '',
        );
        setInferenceMaxTokens(
          typeof a.inferenceMaxTokens === 'number' ? String(a.inferenceMaxTokens) : '',
        );
        setFastPathModel(typeof a.fastPathModel === 'string' ? a.fastPathModel : '');
        setVisionEnabled((a.vision as { enabled?: boolean })?.enabled === true);
        const vModel = (a.vision as { model?: string })?.model ?? 'gemini-2.5-flash';
        setVisionModel(['gemini-2.5-flash', 'gemini-2.5-pro', 'claude-vision'].includes(vModel) ? (vModel as any) : 'gemini-2.5-flash');
        setVisionRagOnImages((a.vision as { ragOnImages?: boolean })?.ragOnImages !== false);
        setVisionAutoExtractText((a.vision as { autoExtractText?: boolean })?.autoExtractText !== false);
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
                /** Sin esto el guardado del panel borraría el borrador que dejó el widget. */
                answerSample: typeof c.answerSample === 'string' ? c.answerSample : undefined,
                count: typeof c.count === 'number' ? c.count : 0,
                lastSeen: typeof c.lastSeen === 'string' ? c.lastSeen : new Date().toISOString(),
                dismissed: c.dismissed === true,
              }))
            : [],
        );
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  const onOpenToolsTab = useCallback(() => setTab('tools'), [setTab]);

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
        const integrations = Array.isArray(data?.mcpIntegrations)
          ? (data.mcpIntegrations as McpIntegrationMeta[]).filter(
              (x) => x && typeof x.key === 'string' && typeof x.name === 'string',
            )
          : [];
        setMcpIntegrations(integrations);
        const uc = data?.unifiedCounts;
        setUnifiedCounts(
          uc && typeof uc.mcp === 'number' && typeof uc.builtin === 'number'
            ? { mcp: uc.mcp, builtin: uc.builtin }
            : null,
        );
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
        setMcpIntegrations([]);
        setUnifiedCounts(null);
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

  /** Match dinámico tool del plan ↔ key del catálogo MCP (sin lista quemada). */
  const mcpIntegrationByPlanToolId = useMemo(() => {
    const map = new Map<string, McpIntegrationMeta>();
    for (const integ of mcpIntegrations) {
      const key = integ.key.trim();
      if (!key) continue;
      map.set(key, integ);
      map.set(key.replace(/_/g, '-'), integ);
      map.set(key.replace(/-/g, '_'), integ);
    }
    return map;
  }, [mcpIntegrations]);

  const planToolsStandalone = useMemo(
    () => TOOLS.filter((t) => !mcpIntegrationByPlanToolId.has(t.id)),
    [mcpIntegrationByPlanToolId],
  );

  const planToolsViaMcp = useMemo(
    () => TOOLS.filter((t) => mcpIntegrationByPlanToolId.has(t.id)),
    [mcpIntegrationByPlanToolId],
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
    if (typeof data.warning === 'string' && data.warning.trim()) {
      toast.success('Guardado, con aviso.');
      setUploadErr(data.warning);
    } else {
      toast.success('Guardado.');
    }
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
    const fp = fastPathModel.trim();
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
      vision: {
        enabled: visionEnabled,
        model: visionModel,
        ragOnImages: visionRagOnImages,
        autoExtractText: visionAutoExtractText,
        maxImageSize: 20,
        acceptedFormats: ['jpeg', 'png', 'webp'],
      },
      ...(() => {
        const saved = skillsConfigForSave(skillCatalog, skillsConfig);
        return { skills: saved.skillIds, skillsConfig: saved.skillsConfig };
      })(),
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
    if (fp === '') {
      patch.fastPathModel = null;
    } else {
      patch.fastPathModel = fp;
    }
    await save(patch);
  }

  async function saveTools() {
    await save({ tools, enabledMcpToolIds: mcpToolIds });
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

  async function confirmDeleteAgent() {
    if (!agent || agent.isPlatform || deleting) return;

    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/agents/${agent._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'No se pudo eliminar el agente.');
        return;
      }
      setShowDeleteConfirm(false);
      toast.success('Agente eliminado.');
      router.push('/dashboard/agents');
    } catch {
      setError('Error de red al eliminar el agente.');
    } finally {
      setDeleting(false);
    }
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

  function updateToolConfig(toolId: string, key: string, value: unknown) {
    setTools((prev) => prev.map((t) =>
      t.toolId === toolId ? { ...t, config: { ...(t.config ?? {}), [key]: value } } : t,
    ));
  }

  // ── Multi-webhook helpers ───────────────────────────────────────────────
  function getWebhookEntries(t: ToolConfig): WebhookEntry[] {
    // UI muestra entradas incompletas para que el usuario pueda rellenarlas
    return extractWebhookEntries(t.config, { includeIncomplete: true });
  }
  function setWebhookEntries(toolId: string, entries: WebhookEntry[]) {
    setTools((prev) => prev.map((t) =>
      t.toolId === toolId
        ? { ...t, config: { ...(t.config ?? {}), webhooks: entries, url: undefined, secret: undefined } }
        : t,
    ));
  }
  function addWebhook(toolId: string) {
    const cur = getWebhookEntries({ toolId, config: tools.find((x) => x.toolId === toolId)?.config ?? {} });
    setWebhookEntries(toolId, [
      ...cur,
      { id: generateWebhookId(), name: `webhook_${cur.length + 1}`, description: '', url: '' },
    ]);
  }
  function updateWebhook(toolId: string, whId: string, patch: Partial<WebhookEntry>) {
    const cur = getWebhookEntries({ toolId, config: tools.find((x) => x.toolId === toolId)?.config ?? {} });
    const next = cur.map((w) => w.id === whId
      ? {
          ...w,
          ...patch,
          ...(patch.name !== undefined ? { name: sanitizeWebhookName(patch.name) } : {}),
        }
      : w,
    );
    setWebhookEntries(toolId, next);
  }
  function removeWebhook(toolId: string, whId: string) {
    const cur = getWebhookEntries({ toolId, config: tools.find((x) => x.toolId === toolId)?.config ?? {} });
    setWebhookEntries(toolId, cur.filter((w) => w.id !== whId));
  }

  // ── Google Sheets helpers (mismo patrón que webhooks) ─────────────────
  function getSheetEntries(t: ToolConfig): SheetEntry[] {
    return extractSheetEntries(t.config, { includeIncomplete: true });
  }
  function setSheetEntries(toolId: string, entries: SheetEntry[]) {
    setTools((prev) => prev.map((t) =>
      t.toolId === toolId
        ? { ...t, config: { ...(t.config ?? {}), sheets: entries } }
        : t,
    ));
  }
  function addSheet(toolId: string) {
    const cur = getSheetEntries({ toolId, config: tools.find((x) => x.toolId === toolId)?.config ?? {} });
    setSheetEntries(toolId, [
      ...cur,
      { id: generateSheetId(), name: `sheet_${cur.length + 1}`, description: '', matrixNeed: '', url: '' },
    ]);
  }
  function updateSheet(toolId: string, sheetId: string, patch: Partial<SheetEntry>) {
    const cur = getSheetEntries({ toolId, config: tools.find((x) => x.toolId === toolId)?.config ?? {} });
    const next = cur.map((s) => s.id === sheetId
      ? {
          ...s,
          ...patch,
          ...(patch.name !== undefined ? { name: sanitizeSheetName(patch.name) } : {}),
        }
      : s,
    );
    setSheetEntries(toolId, next);
  }
  function removeSheet(toolId: string, sheetId: string) {
    const cur = getSheetEntries({ toolId, config: tools.find((x) => x.toolId === toolId)?.config ?? {} });
    setSheetEntries(toolId, cur.filter((s) => s.id !== sheetId));
  }
  async function testSpecificWebhook(whId: string) {
    setError(''); setSuccess(''); setWebhookTestBusy(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(id)}/test-webhook`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookId: whId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Error al probar webhook.'); return; }
      // data.ok refleja el res.ok del fetch al webhook real (solo true para 2xx)
      if (data.ok) {
        setSuccess(`Webhook OK: el endpoint respondió HTTP ${data.status}.`);
      } else if (data.status === 404) {
        setError(`HTTP 404 — la URL existe pero el path no responde. Verifica que el workflow esté ACTIVADO en n8n (toggle Active) y que estés usando la Production URL, no la Test URL.`);
      } else {
        setError(`El endpoint respondió HTTP ${data.status} ${data.statusText ?? ''}. Revisa que acepte POST JSON y devuelva 2xx.`);
      }
    } catch {
      setError('No se pudo contactar el webhook (red, timeout o servidor inalcanzable).');
    } finally {
      setWebhookTestBusy(false);
      setTimeout(() => { setSuccess(''); setError(''); }, 8000);
    }
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
    const { uploadRagFileToAgent } = await import('@/lib/rag-upload-client');
    const result = await uploadRagFileToAgent(id, file, {
      onStatus: (msg) => setUploadMsg(msg),
    });
    if (!result.ok) return { ok: false, error: result.error ?? 'Error al subir archivo.' };
    if (typeof result.message === 'string' && result.message.includes('No se pudo indexar')) {
      setUploadErr(result.message);
    } else if (result.message) {
      setUploadMsg(result.message);
    }
    const agentRes = await fetch(`/api/agents/${id}`);
    const agentData = await agentRes.json();
    if (agentData.agent) {
      setRagSources(agentData.agent.ragSources ?? []);
      setAgent(agentData.agent);
    }
    return { ok: true, preview: result.source as RagSource | undefined };
  }

  async function runRagUploadBatch(files: File[]) {
    if (agent?.isPlatform || readOnly || !files.length) return;
    setUploadErr('');
    setUploadMsg('');
    const list = Array.from(files).filter((f) => f.size > 0);
    if (!list.length) return;

    const isZip = list.length === 1 && (
      list[0].name.toLowerCase().endsWith('.zip') ||
      list[0].type === 'application/zip' ||
      list[0].type === 'application/x-zip-compressed'
    );

    if (isZip || list.length >= 6) {
      setRagUploadProgress({ current: 0, total: list.length, fileName: isZip ? list[0].name : `${list.length} archivos` });
      const form = new FormData();
      if (isZip) {
        form.append('zip', list[0]);
      } else {
        list.forEach((f) => form.append('files', f));
      }
      try {
        const res = await fetch(`/api/agents/${id}/rag/bulk`, { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) {
          setUploadErr(typeof data.error === 'string' ? data.error : 'Error en carga masiva.');
          setRagUploadProgress(null);
          return;
        }
        if (data.mode === 'async' && data.jobId) {
          let attempts = 0;
          const poll = async () => {
            attempts += 1;
            const st = await fetch(`/api/agents/${id}/rag/bulk?jobId=${encodeURIComponent(data.jobId)}`);
            const stData = await st.json();
            const job = stData.job;
            if (job) {
              setRagUploadProgress({
                current: job.processedFiles ?? 0,
                total: job.totalFiles ?? list.length,
                fileName: `Procesando (${job.status})…`,
              });
              if (job.status === 'completed' || job.status === 'failed' || attempts > 120) {
                setRagUploadProgress(null);
                const agentRes = await fetch(`/api/agents/${id}`);
                const agentData = await agentRes.json();
                if (agentData.agent) {
                  setRagSources(agentData.agent.ragSources ?? []);
                  setAgent(agentData.agent);
                }
                if (job.fileErrors?.length) {
                  setUploadErr(job.fileErrors.map((e: { file: string; error: string }) => `${e.file}: ${e.error}`).join(' | '));
                }
                setUploadMsg(
                  job.status === 'failed' && !job.processedFiles
                    ? 'La carga masiva falló.'
                    : `Almacenamiento masivo: ${job.processedFiles}/${job.totalFiles} archivo(s) indexados.`,
                );
                setTimeout(() => setUploadMsg(''), 6000);
                return;
              }
            }
            setTimeout(poll, 1500);
          };
          await poll();
          return;
        }
        const agentRes = await fetch(`/api/agents/${id}`);
        const agentData = await agentRes.json();
        if (agentData.agent) {
          setRagSources(agentData.agent.ragSources ?? []);
          setAgent(agentData.agent);
        }
        if (Array.isArray(data.errors) && data.errors.length) {
          setUploadErr(data.errors.map((e: { file: string; error: string }) => `${e.file}: ${e.error}`).join(' | '));
        }
        setUploadMsg(`Listo: ${data.processedFiles ?? list.length} archivo(s) procesados.`);
        setTimeout(() => setUploadMsg(''), 5000);
      } finally {
        setRagUploadProgress(null);
      }
      return;
    }

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
  const getSkillRow = useCallback(
    (skillId: string) => skillsConfig.find((s) => s?.id === skillId),
    [skillsConfig],
  );
  const [skillCategoryFilter, setSkillCategoryFilter] = useState<string>('all');

  const profileSkills = useMemo(
    () => skillCatalog.filter((s) => s.kind === 'profile'),
    [skillCatalog],
  );
  const capabilitySkills = useMemo(
    () => skillCatalog.filter((s) => s.kind === 'capability'),
    [skillCatalog],
  );
  const skillCategoryOptions = useMemo(() => {
    const cats = new Set<string>();
    for (const s of skillCatalog) {
      const c = (s.category || 'general').trim() || 'general';
      cats.add(c);
    }
    return ['all', ...[...cats].sort()];
  }, [skillCatalog]);
  const filteredProfiles = useMemo(() => {
    if (skillCategoryFilter === 'all') return profileSkills;
    return profileSkills.filter((s) => (s.category || 'general') === skillCategoryFilter);
  }, [profileSkills, skillCategoryFilter]);
  const capabilitiesByCategory = useMemo(() => {
    const map = new Map<string, AgentSkillCatalogEntry[]>();
    for (const s of capabilitySkills) {
      if (skillCategoryFilter !== 'all' && (s.category || 'general') !== skillCategoryFilter) continue;
      const c = (s.category || 'general').trim() || 'general';
      const list = map.get(c) ?? [];
      list.push(s);
      map.set(c, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [capabilitySkills, skillCategoryFilter]);
  const categoryLabel = useCallback((cat: string) => {
    return SKILL_CATEGORY_LABELS[cat as keyof typeof SKILL_CATEGORY_LABELS] ?? cat;
  }, []);
  const toggleSkill = useCallback((skillId: string, enabled: boolean, defaultPriority: number) => {
    setSkillsConfig((prev) => {
      const idx = prev.findIndex((s) => s?.id === skillId);
      if (!enabled) {
        if (idx === -1) return prev;
        return prev.filter((s) => s.id !== skillId);
      }
      const full = buildSkillConfigEntry(skillCatalog, skillId, true, defaultPriority);
      if (!full) return prev;
      if (idx === -1) return [...prev, full];
      const next = [...prev];
      next[idx] = { ...full, priority: next[idx].priority ?? full.priority };
      return next;
    });
  }, [skillCatalog]);
  const setSkillPriority = useCallback((skillId: string, value: string, defaultPriority: number) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const p = Math.max(0, Math.min(1000, Math.floor(n)));
    setSkillsConfig((prev) => {
      const idx = prev.findIndex((s) => s?.id === skillId);
      if (idx === -1) {
        const full = buildSkillConfigEntry(skillCatalog, skillId, true, p || defaultPriority);
        return full ? [...prev, full] : prev;
      }
      const next = [...prev];
      next[idx] = { ...next[idx], priority: p };
      return next;
    });
  }, [skillCatalog]);
  const enabledSkillsCount = countEnabledSkills(skillCatalog, skillsConfig);

  if (loading) {
    return (
      <div className="relative overflow-hidden" style={{ minHeight: '100%' }}>
        <div className="hero-glow pointer-events-none" style={{ background: R, top: '-200px', right: '-60px' }} />
        <div className="hero-glow pointer-events-none" style={{ background: B, top: '100px', left: '-120px' }} />
        <div className="relative max-w-3xl mx-auto">
          <AiLoadingInline
            label="Cargando agentes…"
            hint="Preparando configuración e integraciones"
            style={{ padding: '64px 16px' }}
          />
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
    ragLoaded ? `Almacenamiento cargado (${ragN} fuente${ragN !== 1 ? 's' : ''})`
      : agent.ragEnabled && ragN === 0 ? 'Almacenamiento activo · sin fuentes'
        : !agent.ragEnabled && ragN > 0 ? `Almac. off · ${ragN} fuente${ragN !== 1 ? 's' : ''} guardada${ragN !== 1 ? 's' : ''}`
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

  const TABS = [
    { id: 'general' as const, label: 'General', icon: <Settings size={14} /> },
    { id: 'rules' as const, label: 'Reglas', icon: <Sparkles size={14} />, count: behaviorRules.length },
    { id: 'faqs' as const, label: 'FAQ', icon: <HelpCircle size={14} />, count: agentFaqs.length },
    { id: 'tools' as const, label: 'Herramientas', icon: <Wrench size={14} />, count: tools.length + mcpToolIds.length },
    { id: 'rag' as const, label: 'Almacén', icon: <Zap size={14} />, count: ragN },
    { id: 'subagents' as const, label: 'Sub-agentes', icon: <Network size={14} />, count: subAgents.length },
    { id: 'scheduled-tasks' as const, label: 'Tareas', icon: <Clock size={14} />, count: scheduledTaskCount },
    { id: 'whatsapp' as const, label: 'WhatsApp', icon: <MessageCircle size={14} /> },
  ];
  const visibleTabs = soloChatOnly
    ? TABS.filter((t) => t.id === 'general')
    : TABS.filter((t) => t.id !== 'whatsapp' || whatsappAllowed);

  const deleteDescription =
    (agent.subAgentIds?.length ?? 0) > 0
      ? `Se eliminará «${agent.name}», sus ${agent.subAgentIds!.length} sub-agente(s) y los widgets vinculados. Esta acción no se puede deshacer.`
      : `Se eliminará «${agent.name}» y los widgets vinculados. Esta acción no se puede deshacer.`;

  const activeTabIdx = Math.max(0, visibleTabs.findIndex((t) => t.id === tab));
  const activeTabLabel = visibleTabs[activeTabIdx]?.label ?? 'Agente';

  return (
    <div className="agent-editor-page dashboard-shell relative overflow-hidden min-h-full">
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Eliminar agente"
        description={deleteDescription}
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        onConfirm={() => void confirmDeleteAgent()}
        onCancel={() => { if (!deleting) setShowDeleteConfirm(false); }}
      />
      <div className="hero-glow pointer-events-none" style={{ background: R, top: '-200px', right: '-60px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: B, top: '120px', left: '-120px' }} />

      <div className="agent-editor-page__inner relative px-4 sm:px-5 py-4 md:py-5">
      {agent && (
        <>
          <AgentMcpOpenFromQuery
            agentId={id}
            plan={plan}
            features={subscription?.features}
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

      <div className="agent-editor-page__header">
        <AgentDetailHeader
          name={agent.name}
          model={model || agent.model}
          isDisabled={isDisabled}
          hubSynced={agent.syncStatus === 'synced'}
          ragSummary={soloChatOnly ? null : ragSummary}
          readOnly={readOnly}
          deleting={deleting}
          saving={saving}
          onToggleStatus={toggleStatus}
          onDelete={() => setShowDeleteConfirm(true)}
        />
      </div>

      <div className="agent-editor-page__grid">
      <BuilderRail
        mode="tabs"
        ariaLabel="Secciones del agente"
        title={activeTabLabel}
        subtitle={`Sección ${activeTabIdx + 1} de ${visibleTabs.length}`}
        items={visibleTabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon, count: t.count }))}
        activeId={tab}
        onSelect={(id) => setTab(id as AgentDetailTabId)}
        footer={
          <div className="dashboard-builder-rail__tip">
            <p className="dashboard-builder-rail__tip-label m-0">
              <Lightbulb size={12} className="inline mr-1" aria-hidden />
              Tip
            </p>
            <p className="dashboard-builder-rail__tip-text m-0">{AGENT_TAB_TIPS[tab]}</p>
          </div>
        }
      />
      <div className="agent-editor-page__main flex-1 min-w-0">
      <div className="agent-editor-form-card" data-tour="agent-edit-form">
      {soloChatOnly && (
        <p className="text-xs mb-4 m-0 px-3 py-2 rounded-xl border" style={{ color: 'var(--muted-foreground)', borderColor: 'var(--border)', background: 'var(--muted)' }}>
          Plan <strong>Solo</strong>: chat básico. Actualiza a Basic o superior para reglas, FAQ, herramientas, almacenamiento y sub-agentes.
        </p>
      )}

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
          <AgentEditorSection>
            <p className={SECTION_TITLE}>Información básica</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>Nombre</label>
                <input className="landing-input" style={inp} value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>Descripción</label>
                <textarea
                  className="landing-input"
                  style={{ ...inp, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={readOnly}
                  rows={3}
                  placeholder="Breve resumen del rol del agente"
                />
              </div>
            </div>
          </AgentEditorSection>

          {!soloChatOnly && (
          <AgentEditorSection bar="cool">
            <p className={`${SECTION_TITLE} agent-editor-section__title--row`}>
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
          </AgentEditorSection>
          )}

          {!soloChatOnly && (
          <AgentEditorSection>
            <p className={SECTION_TITLE}>Solo propósito del agente</p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
              Si está activo, el motor en AIBackHub refuerza en el system prompt que el agente{' '}
              <strong>no responda temas fuera de su rol</strong>: solo lo definido en instrucciones, FAQs, reglas y lo que permitan herramientas MCP, skills y almacenamiento. Útil para un vendedor o soporte que no debe improvisar en otros dominios.
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
                  background: strictPurposeOnly ? R : 'var(--border)',
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
          </AgentEditorSection>
          )}

          <AgentEditorSection>
            <p className={SECTION_TITLE}>Contexto de conversación</p>
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
                  background: persistConversationHistory ? R : 'var(--border)',
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
          </AgentEditorSection>

          <AgentEditorSection>
            <p className={SECTION_TITLE}>Modelo de IA</p>
            <div data-tour="agent-edit-model">
            <ModelSelectionSummary
              primaryId={model}
              fallbackIds={fallbackModels}
              models={summaryModels}
              accentColor={R}
              fallbackCatalog={hfFallbackCatalog}
              onAddFallback={(id) => setFallbackModels((prev) => [...prev, id])}
              readOnly={readOnly}
            />
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
            <ModelCatalogPicker
              models={displayModels}
              selectedId={model}
              onSelect={setModel}
              disabled={readOnly}
              accentColor={R}
              showTier={false}
              searchPlaceholder="Buscar modelo..."
              inputStyle={inp}
            />
            {!soloChatOnly && (
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
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '6px', color: 'var(--muted-foreground)' }}>
                  Modelo fast-path saludos (opcional)
                </label>
                <input
                  style={inp}
                  value={fastPathModel}
                  onChange={(e) => setFastPathModel(e.target.value)}
                  placeholder="Ej: gemini-2.5-flash (vacío = auto-seleccionar)"
                  disabled={readOnly}
                />
              </div>
            </div>
            )}
            {!soloChatOnly && (
            <AgentFallbackPicker
              primaryModelId={model}
              fallbackModels={fallbackModels}
              onChange={setFallbackModels}
              catalogModels={hfFallbackCatalog}
              loading={hfFallbackLoading}
              catalogError={hfFallbackError}
              adminRestricted={hfAdminRestricted}
              planHasFallbacks={hfPlanHasFallbacks}
              readOnly={readOnly}
              accentColor={R}
            />
            )}
            </div>
          </AgentEditorSection>

          {!soloChatOnly && (
          <AgentEditorSection bar="cool">
            <p className={`${SECTION_TITLE} agent-editor-section__title--row`}>
              <ImageIcon size={14} style={{ opacity: 0.85 }} /> Análisis de imágenes (Vision)
            </p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
              Habilita que el agente analice imágenes. El widget puede procesar imágenes de usuarios y el agente responderá basándose en su contenido.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: readOnly ? 'default' : 'pointer', marginBottom: '16px' }}>
              <div
                onClick={() => !readOnly && setVisionEnabled((prev) => !prev)}
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  position: 'relative',
                  cursor: readOnly ? 'not-allowed' : 'pointer',
                  background: visionEnabled ? R : 'var(--border)',
                  transition: 'background 0.2s',
                  opacity: readOnly ? 0.75 : 1,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: visionEnabled ? 21 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                  }}
                />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                {visionEnabled ? 'Vision activada' : 'Vision desactivada'}
              </span>
            </label>
            {visionEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '6px', color: 'var(--muted-foreground)' }}>
                    Modelo de visión
                  </label>
                  <select
                    style={{ ...inp, fontSize: '12px' }}
                    value={visionModel}
                    onChange={(e) => setVisionModel(e.target.value as any)}
                    disabled={readOnly}
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (rápido)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (preciso)</option>
                    <option value="claude-vision">Claude Vision</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', cursor: readOnly ? 'default' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={visionRagOnImages}
                      onChange={(e) => !readOnly && setVisionRagOnImages(e.target.checked)}
                      disabled={readOnly}
                      style={{ cursor: readOnly ? 'not-allowed' : 'pointer' }}
                    />
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>RAG + Visión</span>
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', cursor: readOnly ? 'default' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={visionAutoExtractText}
                      onChange={(e) => !readOnly && setVisionAutoExtractText(e.target.checked)}
                      disabled={readOnly}
                      style={{ cursor: readOnly ? 'not-allowed' : 'pointer' }}
                    />
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>OCR automático</span>
                  </label>
                </div>
              </div>
            )}
            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '10px', marginBottom: 0 }}>
              Guarda con &quot;Guardar información&quot; para sincronizar con AIBackHub.
            </p>
          </AgentEditorSection>
          )}

          {!soloChatOnly && (
          <>
          <AgentEditorSection bar="cool">
            <p className={SECTION_TITLE}>Skills</p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
              Capas que se suman: system prompt + skills + RAG + MCP. Las skills activan tools; el motor las une.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: 'rgba(var(--brand-primary-rgb),0.12)', color: B,
              }}>
                {enabledSkillsCount} activa{enabledSkillsCount !== 1 ? 's' : ''}
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                {skillCatalog.length} en catálogo
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {skillCategoryOptions.map((cat) => {
                const active = skillCategoryFilter === cat;
                const label = cat === 'all' ? 'Todas' : categoryLabel(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSkillCategoryFilter(cat)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      border: `1px solid ${active ? `${B}66` : 'var(--border)'}`,
                      background: active ? `rgba(var(--brand-primary-rgb),0.12)` : 'transparent',
                      color: active ? B : 'var(--muted-foreground)',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Perfiles de comportamiento
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {skillCatalogLoading ? (
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '0 0 8px' }}>Cargando catálogo…</p>
              ) : null}
              {!skillCatalogLoading && filteredProfiles.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>No hay perfiles en esta categoría.</p>
              ) : null}
              {filteredProfiles.map((skill) => {
                const enabled = isSkillEnabled(skillsConfig, skill.id);
                const row = getSkillRow(skill.id);
                const priority = row?.priority ?? skill.defaultPriority;
                const mcpCount = skill.config?.active_tools?.length ?? 0;
                return (
                  <div key={skill.id} style={{
                    border: `1px solid ${enabled ? `${skill.color}44` : 'var(--border)'}`,
                    borderRadius: '12px',
                    padding: '12px 14px',
                    background: enabled ? `${skill.color}10` : 'transparent',
                    transition: 'all .15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: enabled ? skill.color : 'var(--foreground)' }}>
                          <span style={{ marginRight: 6 }}>{skill.icon}</span>{skill.label}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                          {categoryLabel(skill.category || 'general')}
                          {mcpCount > 0 ? ` · ${mcpCount} MCP` : ' · sin MCP'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => !readOnly && toggleSkill(skill.id, !enabled, skill.defaultPriority)}
                        style={{
                          padding: '5px 12px', borderRadius: '999px', border: '1px solid var(--border)',
                          background: enabled ? skill.color : 'transparent',
                          color: enabled ? '#fff' : 'var(--muted-foreground)', cursor: readOnly ? 'default' : 'pointer',
                          fontSize: '11px', fontWeight: 700, flexShrink: 0,
                        }}
                      >
                        {enabled ? 'Activo' : 'Inactivo'}
                      </button>
                    </div>
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ fontSize: 11, color: 'var(--muted-foreground)', cursor: 'pointer', userSelect: 'none' }}>
                        Ver detalle
                      </summary>
                      <p style={{ margin: '8px 0 6px', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
                        {skill.description}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: 10, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                        {skill.id}
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
                          onChange={(e) => setSkillPriority(skill.id, e.target.value, skill.defaultPriority)}
                          disabled={readOnly || !enabled}
                        />
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>

            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Capacidades
            </p>
            {capabilitiesByCategory.length === 0 && !skillCatalogLoading ? (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>No hay capacidades en esta categoría.</p>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {capabilitiesByCategory.map(([cat, skills]) => (
                <div key={cat}>
                  <p style={{
                    margin: '0 0 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--muted-foreground)',
                  }}>
                    {categoryLabel(cat)}
                  </p>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 8,
                  }}>
                    {skills.map((skill) => {
                      const active = isSkillEnabled(skillsConfig, skill.id);
                      const mcpCount = skill.config?.active_tools?.length ?? 0;
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          title={skill.description}
                          disabled={readOnly}
                          onClick={() => !readOnly && toggleSkill(skill.id, !active, skill.defaultPriority)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: 4,
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 700,
                            border: `1px solid ${active ? `${skill.color}66` : 'var(--border)'}`,
                            background: active ? `${skill.color}14` : 'var(--background)',
                            color: active ? skill.color : 'var(--foreground)',
                            cursor: readOnly ? 'default' : 'pointer',
                            transition: 'all 0.15s',
                            opacity: readOnly ? 0.7 : 1,
                            minHeight: 72,
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{skill.icon}</span>
                            <span>{active ? '✓ ' : ''}{skill.label}</span>
                          </span>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'var(--muted-foreground)',
                            lineHeight: 1.35,
                          }}>
                            {mcpCount > 0 ? `${mcpCount} tools MCP` : 'Solo prompt'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </AgentEditorSection>
          </>
          )}

          <AgentEditorSection bar="cool">
            <p className={SECTION_TITLE}>System Prompt</p>
            <textarea
              className="landing-input"
              style={{ ...inp, minHeight: '160px', resize: 'vertical', fontFamily: 'inherit' }}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={readOnly}
              readOnly={readOnly}
            />
          </AgentEditorSection>

          {!readOnly && (
          <button
            type="button"
            data-tour="agent-edit-save"
            onClick={saveGeneral}
            disabled={saving}
            className="agent-editor-page__save"
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
          <AgentEditorSection>
            <p className={SECTION_TITLE}>Reglas de comportamiento y flujo</p>
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
          </AgentEditorSection>

          {behaviorRules.length === 0 ? (
            <AgentEditorSection innerStyle={{ textAlign: 'center', padding: '28px 16px' }}>
              <Sparkles size={24} style={{ color: 'var(--muted-foreground)', margin: '0 auto 8px' }} />
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', margin: 0 }}>
                Sin reglas configuradas aún.
              </p>
            </AgentEditorSection>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {behaviorRules
                .slice()
                .sort((a, b) => a.priority - b.priority)
                .map((rule) => (
                  <AgentEditorSection key={rule.id} outerStyle={{ borderColor: 'rgba(var(--brand-primary-rgb),0.2)' }}>
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
                      <textarea
                        className="landing-input"
                        style={{ ...inp, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
                        value={rule.interpretedRule}
                        disabled={readOnly}
                        onChange={(e) =>
                          setBehaviorRules((prev) =>
                            prev.map((x) => (x.id === rule.id ? { ...x, interpretedRule: e.target.value } : x)),
                          )
                        }
                        placeholder="Regla interpretada (qué debe hacer exactamente el agente)"
                      />
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
                  </AgentEditorSection>
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
          <AgentEditorSection>
            <p className={SECTION_TITLE}>Preguntas frecuentes</p>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
              Define pares pregunta–respuesta para que el modelo las use cuando la consulta sea equivalente. Al guardar,
              se integran al system prompt y se sincronizan. El widget registra preguntas repetidas que
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
          </AgentEditorSection>

          {agentFaqs.length === 0 ? (
            <AgentEditorSection innerStyle={{ textAlign: 'center', padding: '28px 16px' }}>
              <HelpCircle size={24} style={{ color: 'var(--muted-foreground)', margin: '0 auto 8px' }} />
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', margin: 0 }}>
                Sin FAQs aún. Añade la primera o espera a que aparezcan candidatas desde el widget.
              </p>
            </AgentEditorSection>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {agentFaqs
                .slice()
                .sort((a, b) => a.priority - b.priority)
                .map((faq) => (
                  <AgentEditorSection key={faq.id} outerStyle={{ borderColor: 'rgba(var(--brand-primary-rgb),0.22)' }}>
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
                      <input
                        className="landing-input"
                        style={inp}
                        value={faq.question}
                        disabled={readOnly}
                        placeholder="Pregunta que hace el usuario"
                        onChange={(e) =>
                          setAgentFaqs((prev) =>
                            prev.map((x) => (x.id === faq.id ? { ...x, question: e.target.value } : x)),
                          )
                        }
                      />
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
                    <textarea
                      className="landing-input"
                      style={{ ...inp, minHeight: 88, resize: 'vertical', fontFamily: 'inherit', marginTop: 10 }}
                      value={faq.answer}
                      disabled={readOnly}
                      placeholder="Respuesta canónica del agente"
                      onChange={(e) =>
                        setAgentFaqs((prev) =>
                          prev.map((x) => (x.id === faq.id ? { ...x, answer: e.target.value } : x)),
                        )
                      }
                    />
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
                  </AgentEditorSection>
                ))}
            </div>
          )}

          <AgentEditorSection>
            <p className={SECTION_TITLE}>Candidatas (desde el widget)</p>
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
                        background: 'rgba(var(--brand-primary-rgb),0.05)',
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
                              style={{ borderColor: `${B}55`, color: B, cursor: 'pointer', background: 'rgba(var(--brand-primary-rgb),0.08)' }}
                              onClick={() => {
                                const q = c.questionSample.trim();
                                if (!q) return;
                                setAgentFaqs((prev) => [
                                  ...prev,
                                  {
                                    id: crypto.randomUUID(),
                                    question: q.slice(0, 500),
                                    /** Lo que ya contestó el agente, para revisar en vez de escribir de cero. */
                                    answer: (c.answerSample ?? '').trim(),
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
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                      <p style={{ margin: '8px 0 0', lineHeight: 1.4, color: 'var(--foreground)' }}>{c.questionSample}</p>
                      {c.answerSample?.trim() && (
                        <div
                          style={{
                            margin: '8px 0 0',
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px dashed var(--border)',
                            background: 'var(--background)',
                          }}
                        >
                          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)' }}>
                            Respuesta que dio el agente — revísala antes de fijarla
                          </p>
                          <p style={{ margin: '4px 0 0', lineHeight: 1.4, color: 'var(--foreground)' }}>
                            {c.answerSample}
                          </p>
                        </div>
                      )}
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
                        Última vez: {c.lastSeen ? new Date(c.lastSeen).toLocaleString('es') : '—'}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </AgentEditorSection>

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
          {/* Diferencia visible: datos del hub (catálogo) + Mongo del agente */}
          <div
            role="region"
            aria-label="Cuentas MCP frente a herramientas del plan"
            style={{
              marginBottom: 16,
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 10,
            }}
            className="agent-tools-split"
          >
            <style>{`@media (min-width:720px){.agent-tools-split{grid-template-columns:1fr 1fr!important}}`}</style>
            <div
              style={{
                borderRadius: 12,
                border: '1px solid rgba(var(--brand-primary-rgb),0.35)',
                background: 'rgba(var(--brand-primary-rgb),0.06)',
                padding: '12px 14px',
              }}
            >
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: R }}>1 · Cuentas (MCP)</p>
              <p style={{ margin: '6px 0 0', fontSize: 11, lineHeight: 1.45, color: 'var(--muted-foreground)' }}>
                Credenciales en el hub. Catálogo vivo:{' '}
                {mcpIntegrations.length
                  ? mcpIntegrations.map((i) => i.name).join(', ')
                  : 'cargando…'}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 11, fontWeight: 600 }}>
                {mcpServers.length} conectada{mcpServers.length === 1 ? '' : 's'}
                {unifiedCounts ? ` · ${unifiedCounts.mcp} tools MCP en hub` : ''}
                {mcpToolIds.length ? ` · ${mcpToolIds.length} activas en este agente` : ''}
              </p>
            </div>
            <div
              style={{
                borderRadius: 12,
                border: '1px solid var(--border)',
                padding: '12px 14px',
              }}
            >
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>2 · Tools del plan (Mongo)</p>
              <p style={{ margin: '6px 0 0', fontSize: 11, lineHeight: 1.45, color: 'var(--muted-foreground)' }}>
                Guardadas en el agente (`tools`). No sustituyen conectar la cuenta MCP.
                {unifiedCounts ? ` Hub también expone ${unifiedCounts.builtin} tools farm builtin.` : ''}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 11, fontWeight: 600 }}>
                {tools.length}/{limits.toolsPerAgent} seleccionadas
              </p>
            </div>
          </div>

          {!readOnly && (
            <div style={{ marginBottom: '16px' }}>
              <McpLandingConnectForm landingAgentId={id} plan={plan} features={subscription?.features} onConnected={loadMcp} />
            </div>
          )}

          {/* ── MCP Integrations (synced) ── */}
          {mcpLoading ? (
            <AgentEditorSection innerStyle={{ textAlign: 'center', padding: '28px 16px' }}>
              <Loader2 size={22} className="animate-spin mx-auto mb-2 block" style={{ color: R }} />
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', margin: 0 }}>Cargando integraciones MCP...</p>
            </AgentEditorSection>
          ) : syncedMcpServers.length > 0 ? (
            <>
              <AgentEditorSection>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <p className={SECTION_TITLE} style={{ margin: 0 }}>1 · Cuentas MCP conectadas</p>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    {mcpToolIds.length} tool{mcpToolIds.length !== 1 ? 's' : ''} activa{mcpToolIds.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '0 0 10px', lineHeight: 1.5 }}>
                  Tools descubiertas al sincronizar cada cuenta. La selección se guarda en Mongo del agente (`enabledMcpToolIds`).
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
                      background: 'rgba(var(--brand-primary-rgb),0.06)',
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
                            ? 'No se pudo conectar con Stargate. Inténtalo de nuevo en unos minutos o vuelve a sincronizar desde Mis agentes.'
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
                      mongodb: '🍃', postgres: '🐘',
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
                          padding: '12px 14px', background: 'rgba(var(--brand-primary-rgb),0.04)',
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
                                  background: allSelected ? 'rgba(var(--brand-primary-rgb),0.08)' : 'transparent',
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
                                  background: selected ? 'rgba(var(--brand-primary-rgb),0.05)' : 'transparent',
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
              </AgentEditorSection>
            </>
          ) : mcpServers.length === 0 && !mcpLoading ? (
            <AgentEditorSection innerStyle={{ textAlign: 'center', padding: '28px 16px' }}>
                <KeyRound size={24} style={{ color: 'var(--muted-foreground)', margin: '0 auto 10px' }} />
                <p style={{ fontWeight: 600, fontSize: '13px', margin: '0 0 6px' }}>Paso 1: aún no hay cuentas MCP</p>
                <p style={{ color: 'var(--muted-foreground)', fontSize: '12px', margin: '0 0 12px', lineHeight: 1.5 }}>
                  Conecta una cuenta del catálogo de arriba
                  {mcpIntegrations.length
                    ? ` (${mcpIntegrations.filter((i) => i.needsCredentials).map((i) => i.name).slice(0, 5).join(', ')}${mcpIntegrations.length > 5 ? '…' : ''})`
                    : ''}
                  . Sin cuenta, esas tools no se ejecutan aunque las marques abajo.
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
            </AgentEditorSection>
          ) : null}

          {/* Pending/Error MCP connections */}
          {pendingOrErrorMcpServers.length > 0 && (
            <AgentEditorSection bar="cool">
              <p className={SECTION_TITLE} style={{ margin: '0 0 10px' }}>Integraciones pendientes / con error</p>
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
                  </div>
                );
                })}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '10px 0 0', lineHeight: 1.5 }}>
                Reintenta la sincronización aquí o revisa las credenciales. También puedes gestionar conexiones en AgentFlowHub.
              </p>
            </AgentEditorSection>
          )}

          {/* ── Tools del plan (Mongo agent.tools) ── */}
          <AgentEditorSection>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <p className={SECTION_TITLE} style={{ margin: 0 }}>2 · Herramientas del plan</p>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{tools.length}/{limits.toolsPerAgent} seleccionadas</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Se guardan en Mongo del agente. Las que coinciden con el catálogo MCP del hub se marcan abajo: la cuenta va en el paso 1.
            </p>

            {planToolsStandalone.length > 0 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, margin: '0 0 8px', color: 'var(--muted-foreground)' }}>
                  Sin cuenta MCP
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: 14 }}>
                  {planToolsStandalone.map((tool) => {
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
                          background: selected ? 'rgba(var(--brand-primary-rgb),0.07)' : 'transparent',
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
              </>
            )}

            {planToolsViaMcp.length > 0 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, margin: '0 0 8px', color: 'var(--muted-foreground)' }}>
                  Mismo servicio que una cuenta MCP (catálogo hub)
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {planToolsViaMcp.map((tool) => {
                    const integ = mcpIntegrationByPlanToolId.get(tool.id);
                    const available = limits.availableToolIds.includes(tool.id);
                    const selected = tools.some((t) => t.toolId === tool.id);
                    const maxed = tools.length >= limits.toolsPerAgent && !selected;
                    const connected = mcpServers.some(
                      (s) =>
                        s.integrationKey === integ?.key ||
                        s.integrationKey.replace(/_/g, '-') === tool.id ||
                        s.integrationKey.replace(/-/g, '_') === tool.id.replace(/-/g, '_'),
                    );
                    return (
                      <button key={tool.id} type="button"
                        onClick={() => !readOnly && available && !maxed ? toggleToolSelection(tool.id) : undefined}
                        disabled={readOnly}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                          borderRadius: '10px', textAlign: 'left', cursor: readOnly || !available || maxed ? 'not-allowed' : 'pointer',
                          border: `1px solid ${selected ? R : 'var(--border)'}`,
                          background: selected ? 'rgba(var(--brand-primary-rgb),0.07)' : 'transparent',
                          opacity: readOnly || !available || maxed ? 0.45 : 1,
                        }}
                      >
                        <span style={{ fontSize: '18px' }}>{tool.icon}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: selected ? R : 'var(--foreground)' }}>{tool.name}</p>
                          <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: 0 }}>
                            {integ
                              ? `En el hub: ${integ.name}. La cuenta se conecta en el paso 1 (MCP).`
                              : tool.description}
                          </p>
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 20,
                            flexShrink: 0,
                            background: connected ? 'rgba(34,197,94,0.12)' : 'rgba(217,119,6,0.12)',
                            color: connected ? '#22c55e' : '#d97706',
                          }}
                        >
                          {connected ? 'Cuenta OK' : 'Falta cuenta MCP'}
                        </span>
                        {!available && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}><Lock size={9} /> {tool.minPlan}+</span>}
                        {selected && <span style={{ width: 16, height: 16, borderRadius: '50%', background: R, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ color: '#fff', fontSize: '9px', fontWeight: 900 }}>✓</span>
                        </span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </AgentEditorSection>

          {/* Config fields for selected tools */}
          {tools.map((t) => {
            const def = TOOL_MAP[t.toolId];
            const mcpTwin = mcpIntegrationByPlanToolId.get(t.toolId);
            // Si el catálogo hub ya cubre este servicio, no pedir API key duplicada aquí
            if (mcpTwin && t.toolId !== 'webhook' && t.toolId !== 'google-sheets') {
              return (
                <AgentEditorSection key={t.toolId} bar="cool">
                  <p className={SECTION_TITLE} style={{ margin: '0 0 6px' }}>
                    {def?.icon} {def?.name ?? t.toolId} — cuenta MCP
                  </p>
                  <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted-foreground)' }}>
                    Este servicio se autentica con la conexión MCP «{mcpTwin.name}» (paso 1).
                    No hace falta pegar otra API key aquí.
                  </p>
                </AgentEditorSection>
              );
            }

            // Webhook tool — UI especial multi-webhook (no usa configFields)
            if (t.toolId === 'webhook') {
              const entries = getWebhookEntries(t);
              return (
                <AgentEditorSection key={t.toolId}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <p className={SECTION_TITLE} style={{ margin: 0 }}>🔗 Webhooks del agente</p>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => addWebhook(t.toolId)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs transition-opacity"
                        style={{ border: `1px solid ${B}`, background: 'rgba(var(--brand-primary-rgb),0.08)', color: B, cursor: 'pointer' }}
                      >
                        <Plus size={13} /> Añadir webhook
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '0 0 14px', lineHeight: 1.5 }}>
                    Configura uno o varios webhooks. El LLM decide cuál disparar según la <strong>descripción de la tarea</strong> que escribas.
                    Cada webhook puede apuntar a un flujo distinto en n8n / Zapier / tu API.
                  </p>

                  {entries.length === 0 ? (
                    <div style={{ padding: '24px 16px', border: '1px dashed var(--border)', borderRadius: 10, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                      Aún no hay webhooks. Pulsa <strong>Añadir webhook</strong> para crear el primero.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {entries.map((w, idx) => (
                        <div key={w.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--muted)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)' }}>WEBHOOK #{idx + 1}</span>
                            {!readOnly && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => void testSpecificWebhook(w.id)}
                                  disabled={webhookTestBusy || !w.url}
                                  title="Enviar POST de prueba"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 11, fontWeight: 600, cursor: webhookTestBusy || !w.url ? 'not-allowed' : 'pointer', opacity: !w.url ? 0.5 : 1 }}
                                >
                                  {webhookTestBusy ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
                                  Probar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeWebhook(t.toolId, w.id)}
                                  title="Eliminar este webhook"
                                  style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                                Nombre interno <span style={{ color: '#ef4444' }}>*</span>
                                <span style={{ marginLeft: 6, color: 'var(--muted-foreground)', fontWeight: 400 }}>(snake_case, se usa como id de la herramienta para el LLM)</span>
                              </label>
                              <input
                                className="landing-input"
                                style={inp}
                                type="text"
                                value={w.name}
                                onChange={(e) => updateWebhook(t.toolId, w.id, { name: e.target.value })}
                                placeholder="leer_correos"
                                disabled={readOnly}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                                Descripción de la tarea <span style={{ color: '#ef4444' }}>*</span>
                                <span style={{ marginLeft: 6, color: 'var(--muted-foreground)', fontWeight: 400 }}>(el LLM lee esto para decidir cuándo invocarlo)</span>
                              </label>
                              <textarea
                                className="landing-input"
                                style={{ ...inp, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
                                value={w.description}
                                onChange={(e) => updateWebhook(t.toolId, w.id, { description: e.target.value })}
                                placeholder="Cuando el usuario pida leer su buzón de correos, escribe los datos en su Google Sheet, etc."
                                disabled={readOnly}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                                URL del webhook <span style={{ color: '#ef4444' }}>*</span>
                              </label>
                              <input
                                className="landing-input"
                                style={inp}
                                type="text"
                                value={w.url}
                                onChange={(e) => updateWebhook(t.toolId, w.id, { url: e.target.value })}
                                placeholder="https://n8n.tu-dominio.com/webhook/abc-def"
                                disabled={readOnly}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                                Secret (opcional)
                                <span style={{ marginLeft: 6, color: 'var(--muted-foreground)', fontWeight: 400 }}>(Bearer token o HMAC)</span>
                              </label>
                              <input
                                className="landing-input"
                                style={inp}
                                type="password"
                                value={w.secret ?? ''}
                                onChange={(e) => updateWebhook(t.toolId, w.id, { secret: e.target.value })}
                                placeholder="opcional"
                                disabled={readOnly}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '14px 0 0', lineHeight: 1.5 }}>
                    Recuerda pulsar <strong>Guardar herramientas</strong> después de añadir/editar webhooks.
                  </p>
                </AgentEditorSection>
              );
            }

            // Google Sheets tool — UI especial multi-sheet
            if (t.toolId === 'google-sheets') {
              const entries = getSheetEntries(t);
              return (
                <AgentEditorSection key={t.toolId}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <p className={SECTION_TITLE} style={{ margin: 0 }}>📊 Google Sheets del agente</p>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => addSheet(t.toolId)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs transition-opacity"
                        style={{ border: `1px solid ${B}`, background: 'rgba(var(--brand-primary-rgb),0.08)', color: B, cursor: 'pointer' }}
                      >
                        <Plus size={13} /> Añadir hoja
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '0 0 14px', lineHeight: 1.5 }}>
                    Pega el enlace del archivo, <strong>elige la pestaña</strong> y describe qué debe buscar el agente.
                    Activa <strong>sync 3 AM</strong> en Plus+ para consultas instantáneas desde Mongo. Archivo <strong>público</strong>.
                  </p>

                  {sheetSyncAvailable ? (
                    <div
                      style={{
                        marginBottom: 14,
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'rgba(var(--brand-primary-rgb),0.04)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>Facturación almacenamiento sync</div>
                        <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '4px 0 0', lineHeight: 1.45 }}>
                          ${SHEET_SYNC_USD_PER_GB}/GB · sync diario 3:00 AM (Bogotá) ·{' '}
                          {sheetSyncMeta ? `${sheetSyncMeta.gbStored} GB almacenados` : 'cargando uso…'}
                          {sheetSyncMeta && sheetSyncMeta.estimatedUsd > 0 ? ` · ~$${sheetSyncMeta.estimatedUsd.toFixed(2)}/mes` : ''}
                        </p>
                      </div>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, cursor: readOnly ? 'not-allowed' : 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={sheetSyncMeta?.billingEnabled ?? false}
                          disabled={readOnly}
                          onChange={async (e) => {
                            const billingEnabled = e.target.checked;
                            const res = await fetch('/api/billing/sheet-sync-usage', {
                              method: 'PATCH',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ billingEnabled }),
                            });
                            if (res.ok) {
                              const j = await res.json() as { billingEnabled?: boolean; billingActive?: boolean };
                              setSheetSyncMeta((prev) => ({
                                billingEnabled: Boolean(j.billingEnabled),
                                gbStored: prev?.gbStored ?? 0,
                                estimatedUsd: prev?.estimatedUsd ?? 0,
                              }));
                              toast.success(billingEnabled ? 'Cobro por almacenamiento activado' : 'Cobro desactivado');
                            } else {
                              toast.error('No se pudo actualizar la facturación');
                            }
                          }}
                        />
                        Cobrar almacenamiento (off por defecto)
                      </label>
                    </div>
                  ) : (
                    <p style={{ fontSize: 11, color: '#d97706', margin: '0 0 14px' }}>
                      Sync nocturno Sheets → Mongo disponible en <strong>Plus</strong> o superior.
                    </p>
                  )}

                  {entries.length === 0 ? (
                    <div style={{ padding: '24px 16px', border: '1px dashed var(--border)', borderRadius: 10, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                      Aún no hay matrices. Pulsa <strong>Añadir hoja</strong> para configurar la primera.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {entries.map((s, idx) => (
                        <GoogleSheetEntryCard
                          key={s.id}
                          entry={s}
                          index={idx}
                          readOnly={readOnly}
                          inp={inp}
                          sheetSyncAvailable={sheetSyncAvailable}
                          onUpdate={(patch) => updateSheet(t.toolId, s.id, patch)}
                          onRemove={() => removeSheet(t.toolId, s.id)}
                        />
                      ))}
                    </div>
                  )}

                  <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '14px 0 0', lineHeight: 1.5 }}>
                    ⚠️ La hoja debe estar compartida como <strong>público con link</strong>. Datos sensibles deberían ir vía Webhook con autenticación.
                  </p>
                </AgentEditorSection>
              );
            }

            // Resto de herramientas — UI genérica con configFields
            if (!def?.configFields?.length) return null;
            return (
              <AgentEditorSection key={t.toolId}>
                <p className={SECTION_TITLE}>{def.icon} {def.name} — Configuración</p>
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
                        value={String((t.config ?? {})[field.key] ?? '')}
                        onChange={(e) => updateToolConfig(t.toolId, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        disabled={readOnly}
                      />
                    </div>
                  ))}
                </div>
              </AgentEditorSection>
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

      {/* ── ALMACENAMIENTO TAB ───────────────────────────────────────────────── */}
      {tab === 'rag' && (
        <>
          {!limits.ragEnabled ? (
            <AgentEditorSection innerStyle={{ textAlign: 'center', padding: '36px 20px' }}>
              <Lock size={32} style={{ color: 'var(--muted-foreground)', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 700, marginBottom: '6px' }}>Almacenamiento no disponible en tu plan</p>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '16px' }}>
                Activa un plan Starter o superior para agregar conocimiento personalizado a tus agentes.
              </p>
              <Link href="/dashboard" className="landing-btn-primary !inline-flex !w-auto no-underline text-sm px-5 py-2 rounded-xl">
                Ver planes →
              </Link>
            </AgentEditorSection>
          ) : (
            <>
              {/* Toggle + description */}
              <AgentEditorSection>
                <p className={SECTION_TITLE}>Almacenamiento — Base de conocimiento</p>
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
                    background: ragEnabled ? R : 'var(--border)', transition: 'background 0.2s',
                    opacity: readOnly ? 0.75 : 1,
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: ragEnabled ? 21 : 3,
                      width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                    }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>
                    {ragEnabled ? 'Almacenamiento activado' : 'Almacenamiento desactivado'}
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
              </AgentEditorSection>

              <AgentEditorSection>
                <p className={SECTION_TITLE}>Memoria del agente</p>
                <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
                  Resumen de memoria.
                </p>
                {memoryStatsLoading && (
                  <p style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
                    <Loader2 size={14} className="animate-spin inline mr-1" />
                    Cargando estadísticas…
                  </p>
                )}
                {!memoryStatsLoading && memoryStats && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    {[
                      { label: 'Fuentes RAG', value: memoryStats.ragSources },
                      { label: 'Vectores (hub)', value: memoryStats.vectorTotal },
                      { label: 'Memorias chat', value: memoryStats.conversationMemories },
                      { label: 'Contextos widget', value: memoryStats.activeSessionContexts },
                      { label: 'Retención (días)', value: memoryStats.historyRetentionDays },
                    ].map((row) => (
                      <div
                        key={row.label}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                        }}
                      >
                        <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', margin: 0 }}>
                          {row.label}
                        </p>
                        <p style={{ fontSize: '20px', fontWeight: 800, margin: '4px 0 0', color: R }}>
                          {row.value.toLocaleString('es')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {!memoryStatsLoading && !memoryStats && (
                  <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: 0 }}>
                    No hay datos de memoria disponibles (sincroniza el agente con el hub si aplica).
                  </p>
                )}
              </AgentEditorSection>

              {ragEnabled && (
                <>
                  {/* Upload zone */}
                  <AgentEditorSection bar="cool">
                    <p className={SECTION_TITLE}>Subir archivos</p>
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
                        <p style={{ margin: 0 }}>{plan} · Almacenamiento {limits.ragEnabled ? 'incluido' : '—'}</p>
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
                        background: dragOver ? 'rgba(var(--brand-primary-rgb),0.05)' : 'transparent',
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
                        accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif,.zip"
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
                            PDF · DOCX · TXT · CSV · JSON · PNG · JPG · WEBP · ZIP — máx. {RAG_MAX_FILE_MB} MB por archivo · 6+ archivos o ZIP usa cola async
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
                  </AgentEditorSection>

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
                  <AgentEditorSection>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <p className={SECTION_TITLE} style={{ margin: 0 }}>
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
                              aria-label="Filtrar fuentes de almacenamiento"
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
                                background: 'rgba(var(--brand-primary-rgb),0.03)',
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
                  </AgentEditorSection>

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
                          style={{ border: `1px solid ${B}`, background: 'rgba(var(--brand-primary-rgb),0.08)', color: B, cursor: 'pointer' }}
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
      {tab === 'scheduled-tasks' && (
        <ScheduledTasksTab agentId={String(agent._id)} plan={plan} readOnly={readOnly} onTaskCountChange={setScheduledTaskCount} />
      )}

      {tab === 'whatsapp' && whatsappAllowed && (
        <WhatsAppTab agentId={String(agent._id)} readOnly={readOnly} />
      )}

      {tab === 'subagents' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <p className="font-bold m-0 mb-0.5">Orquestación y sub-agentes</p>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '12px', margin: 0 }}>
                {limits.subAgentsPerAgent < 0
                  ? `${subAgents.length} sub-agente${subAgents.length !== 1 ? 's' : ''}`
                  : `${subAgents.length}/${limits.subAgentsPerAgent} sub-agentes`}
              </p>
            </div>
            {(limits.subAgentsPerAgent < 0 || subAgents.length < limits.subAgentsPerAgent) && !showNewSub && (
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
                <AgentEditorSection outerStyle={{ borderColor: 'rgba(var(--brand-primary-rgb),0.35)' }}>
                  <p className={SECTION_TITLE}>Nuevo sub-agente</p>
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
                </AgentEditorSection>
              )}

              {subAgents.length === 0 && !showNewSub ? (
                <AgentEditorSection innerStyle={{ textAlign: 'center', padding: '28px 16px' }}>
                  <Network size={28} style={{ color: 'var(--muted-foreground)', margin: '0 auto 10px' }} />
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', margin: 0 }}>
                    Sin sub-agentes aún. Agrega especialistas para orquestar tareas complejas.
                  </p>
                </AgentEditorSection>
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
      </div>
      </div>
      </div>
      </div>
    </div>
  );
}
