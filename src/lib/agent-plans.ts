// ── Tool catalog ─────────────────────────────────────────────────────────────

export interface ToolDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  minPlan: 'free' | 'solo' | 'basic' | 'team' | 'plus' | 'starter' | 'growth' | 'business';
  configFields: { key: string; label: string; placeholder: string; required: boolean }[];
}

export const TOOLS: ToolDef[] = [
  {
    id: 'web-search',
    name: 'Web Search',
    icon: '🔍',
    description: 'Busca información actualizada en internet.',
    minPlan: 'free',
    configFields: [],
  },
  {
    id: 'webhook',
    name: 'Webhook',
    icon: '🔗',
    description: 'Llama a cualquier endpoint HTTP externo.',
    minPlan: 'team',
    configFields: [
      { key: 'url', label: 'URL del Webhook', placeholder: 'https://mi-api.com/hook', required: true },
      { key: 'secret', label: 'Secret (opcional)', placeholder: 'Bearer token o HMAC secret', required: false },
    ],
  },
  {
    id: 'file-upload',
    name: 'File Upload',
    icon: '📎',
    description: 'Permite al usuario subir archivos para que el agente los procese.',
    minPlan: 'plus',
    configFields: [],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    icon: '📧',
    description: 'Envía y lee correos desde una cuenta de Gmail.',
    minPlan: 'team',
    configFields: [
      { key: 'accountEmail', label: 'Cuenta Gmail', placeholder: 'tu@gmail.com', required: true },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '💬',
    description: 'Envía mensajes a canales y usuarios de Slack.',
    minPlan: 'team',
    configFields: [
      { key: 'webhookUrl', label: 'Incoming Webhook URL', placeholder: 'https://hooks.slack.com/...', required: true },
      { key: 'defaultChannel', label: 'Canal por defecto', placeholder: '#general', required: false },
    ],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    icon: '📅',
    description: 'Crea eventos, verifica disponibilidad y agenda reuniones.',
    minPlan: 'plus',
    configFields: [
      { key: 'calendarId', label: 'Calendar ID', placeholder: 'primary o calendar@group.calendar.google.com', required: true },
    ],
  },
  {
    id: 'hubspot',
    name: 'HubSpot CRM',
    icon: '🏢',
    description: 'Gestiona contactos, deals y empresas en HubSpot.',
    minPlan: 'plus',
    configFields: [
      { key: 'apiKey', label: 'HubSpot API Key', placeholder: 'pat-na1-...', required: true },
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    icon: '📱',
    description: 'Envía mensajes via WhatsApp Business API.',
    minPlan: 'plus',
    configFields: [
      { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: '1234567890', required: true },
      { key: 'token', label: 'Access Token', placeholder: 'EAAx...', required: true },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: '📝',
    description: 'Lee y escribe en páginas y databases de Notion.',
    minPlan: 'plus',
    configFields: [
      { key: 'integrationToken', label: 'Integration Token', placeholder: 'secret_...', required: true },
      { key: 'databaseId', label: 'Database ID (opcional)', placeholder: 'xxxxxxxx-xxxx-...', required: false },
    ],
  },
  {
    id: 'mongodb',
    name: 'MongoDB (cliente)',
    icon: '🍃',
    description: 'Consulta datos en un clúster MongoDB del cliente vía MCP en AIBackHub (política por conexión).',
    minPlan: 'plus',
    configFields: [
      { key: 'connectionUri', label: 'Connection URI', placeholder: 'mongodb+srv://…', required: true },
      { key: 'accessMode', label: 'Modo (read_only / read_write)', placeholder: 'read_only', required: false },
    ],
  },
  {
    id: 'postgres',
    name: 'PostgreSQL (cliente)',
    icon: '🐘',
    description: 'Consulta datos en PostgreSQL del cliente vía MCP en AIBackHub (solo lectura por defecto).',
    minPlan: 'plus',
    configFields: [
      { key: 'connectionUri', label: 'Connection URI', placeholder: 'postgresql://…', required: true },
      { key: 'accessMode', label: 'Modo (read_only / read_write)', placeholder: 'read_only', required: false },
    ],
  },
  {
    id: 'zapier',
    name: 'Zapier',
    icon: '⚡',
    description: 'Activa Zaps para conectar con cientos de apps.',
    minPlan: 'business',
    configFields: [
      { key: 'webhookUrl', label: 'Zapier Webhook URL', placeholder: 'https://hooks.zapier.com/...', required: true },
    ],
  },
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

// ── AI Models (respaldo offline; alineado con AgentFlowhub ai-models Google + un HF) ───

export const CLIENT_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', badge: 'Rápido' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google', badge: 'Potente' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', badge: 'Rápido' },
  { id: 'hf/Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B Instruct', provider: 'Hugging Face', badge: 'HF' },
] as const;

// ── Agentes de plataforma (no cuentan en el límite de creación de agentes del plan) ─

/** Solicitudes por usuario y mes que no descuentan del contador de widget (`RequestLog`) si el agente es de plataforma. */
export const PLATFORM_AGENT_FREE_REQUESTS_PER_USER_MONTH = 90;

import {
  PLAN_AGENT_LIMITS,
  PLAN_SUBAGENT_LIMITS,
  PLAN_TOOLS_LIMITS,
  PLAN_RAG_LIMITS,
  formatAgentLimit,
  isAgentLimitReached,
} from '@/lib/plan-catalog';

// ── Per-plan agent limits (sincronizado con plan-catalog.ts) ─────────────────

export interface AgentPlanLimits {
  agents: number;
  subAgentsPerAgent: number;
  toolsPerAgent: number;
  ragEnabled: boolean;
  ragSourcesPerAgent: number;
  ragStorageMbPerAgent: number;
  availableToolIds: string[];
}

const ALL_TOOL_IDS = TOOLS.map((t) => t.id);

const TOOLS_BY_PLAN: Record<string, string[]> = {
  free: ['web-search'],
  solo: [],
  basic: ['web-search', 'webhook', 'gmail', 'slack'],
  team: ['web-search', 'webhook', 'gmail', 'slack'],
  plus: ['web-search', 'webhook', 'gmail', 'slack'],
  starter: ['web-search', 'webhook', 'gmail', 'slack', 'file-upload', 'google-calendar', 'hubspot', 'notion'],
  growth: ALL_TOOL_IDS.filter((id) => id !== 'zapier'),
  business: ALL_TOOL_IDS,
  enterprise: ALL_TOOL_IDS,
};

function buildAgentLimits(planId: string): AgentPlanLimits {
  const rag = PLAN_RAG_LIMITS[planId];
  return {
    agents: PLAN_AGENT_LIMITS[planId] ?? 1,
    subAgentsPerAgent: PLAN_SUBAGENT_LIMITS[planId] ?? 0,
    toolsPerAgent: PLAN_TOOLS_LIMITS[planId] ?? 2,
    ragEnabled: rag !== null && rag !== undefined,
    ragSourcesPerAgent: rag?.sources ?? 0,
    ragStorageMbPerAgent: rag?.mb ?? 0,
    availableToolIds: TOOLS_BY_PLAN[planId] ?? TOOLS_BY_PLAN.free,
  };
}

export const AGENT_PLAN_LIMITS: Record<string, AgentPlanLimits> = {
  free: buildAgentLimits('free'),
  solo: buildAgentLimits('solo'),
  basic: buildAgentLimits('basic'),
  team: buildAgentLimits('team'),
  plus: buildAgentLimits('plus'),
  starter: buildAgentLimits('starter'),
  growth: buildAgentLimits('growth'),
  business: buildAgentLimits('business'),
  enterprise: buildAgentLimits('enterprise'),
};

export function getAgentLimits(plan: string): AgentPlanLimits {
  return AGENT_PLAN_LIMITS[plan] ?? AGENT_PLAN_LIMITS.free;
}

export { formatAgentLimit, isAgentLimitReached } from '@/lib/plan-catalog';

/** Orden para comparar planes (modelos del catálogo con `minPlan`). */
const PLAN_RANK: Record<string, number> = {
  free: 0,
  solo: 1,
  basic: 2,
  team: 3,
  plus: 4,
  starter: 5,
  growth: 6,
  business: 7,
  enterprise: 8,
};

/** True si el plan del usuario cumple el mínimo exigido por el modelo. */
export function planMeetsModelMin(userPlan: string, minPlan?: string): boolean {
  if (!minPlan || minPlan === 'free') return true;
  const u = PLAN_RANK[userPlan] ?? 0;
  const m = PLAN_RANK[minPlan] ?? 0;
  return u >= m;
}

/** Agentes principales del usuario (excluye sub-agentes y catálogo platform). */
export function countOwnedMainAgents(
  agents: Array<{ type?: string; isPlatform?: boolean }> | null | undefined,
): number {
  if (!agents?.length) return 0;
  return agents.filter((a) => a.type === 'agent' && !a.isPlatform).length;
}

