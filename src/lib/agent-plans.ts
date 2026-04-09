// ── Tool catalog ─────────────────────────────────────────────────────────────

export interface ToolDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  minPlan: 'free' | 'starter' | 'growth' | 'business';
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
    minPlan: 'free',
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
    minPlan: 'starter',
    configFields: [],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    icon: '📧',
    description: 'Envía y lee correos desde una cuenta de Gmail.',
    minPlan: 'starter',
    configFields: [
      { key: 'accountEmail', label: 'Cuenta Gmail', placeholder: 'tu@gmail.com', required: true },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '💬',
    description: 'Envía mensajes a canales y usuarios de Slack.',
    minPlan: 'starter',
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
    minPlan: 'growth',
    configFields: [
      { key: 'calendarId', label: 'Calendar ID', placeholder: 'primary o calendar@group.calendar.google.com', required: true },
    ],
  },
  {
    id: 'hubspot',
    name: 'HubSpot CRM',
    icon: '🏢',
    description: 'Gestiona contactos, deals y empresas en HubSpot.',
    minPlan: 'growth',
    configFields: [
      { key: 'apiKey', label: 'HubSpot API Key', placeholder: 'pat-na1-...', required: true },
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    icon: '📱',
    description: 'Envía mensajes via WhatsApp Business API.',
    minPlan: 'growth',
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
    minPlan: 'growth',
    configFields: [
      { key: 'integrationToken', label: 'Integration Token', placeholder: 'secret_...', required: true },
      { key: 'databaseId', label: 'Database ID (opcional)', placeholder: 'xxxxxxxx-xxxx-...', required: false },
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
export const PLATFORM_AGENT_FREE_REQUESTS_PER_USER_MONTH = 500;

// ── Per-plan agent limits ─────────────────────────────────────────────────────

export interface AgentPlanLimits {
  agents: number;         // max main agents
  subAgentsPerAgent: number; // max sub-agents per orchestrator
  toolsPerAgent: number;  // max tools per agent
  ragEnabled: boolean;
  availableToolIds: string[];
}

const ALL_TOOL_IDS = TOOLS.map((t) => t.id);

export const AGENT_PLAN_LIMITS: Record<string, AgentPlanLimits> = {
  free: {
    agents: 1,
    subAgentsPerAgent: 0,
    toolsPerAgent: 2,
    ragEnabled: false,
    availableToolIds: ['web-search', 'webhook'],
  },
  starter: {
    agents: 2,
    subAgentsPerAgent: 1,
    toolsPerAgent: 3,
    ragEnabled: true,
    availableToolIds: ['web-search', 'webhook', 'file-upload', 'gmail', 'slack'],
  },
  growth: {
    agents: 5,
    subAgentsPerAgent: 3,
    toolsPerAgent: 5,
    ragEnabled: true,
    availableToolIds: ['web-search', 'webhook', 'file-upload', 'gmail', 'slack', 'google-calendar', 'hubspot', 'whatsapp', 'notion'],
  },
  business: {
    agents: 15,
    subAgentsPerAgent: 10,
    toolsPerAgent: 10,
    ragEnabled: true,
    availableToolIds: ALL_TOOL_IDS,
  },
  enterprise: {
    agents: 999,
    subAgentsPerAgent: 999,
    toolsPerAgent: 999,
    ragEnabled: true,
    availableToolIds: ALL_TOOL_IDS,
  },
};

export function getAgentLimits(plan: string): AgentPlanLimits {
  return AGENT_PLAN_LIMITS[plan] ?? AGENT_PLAN_LIMITS.free;
}

/** Orden para comparar planes (modelos del catálogo con `minPlan`). */
const PLAN_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  growth: 2,
  business: 3,
  enterprise: 4,
};

/** True si el plan del usuario cumple el mínimo exigido por el modelo. */
export function planMeetsModelMin(userPlan: string, minPlan?: string): boolean {
  if (!minPlan || minPlan === 'free') return true;
  const u = PLAN_RANK[userPlan] ?? 0;
  const m = PLAN_RANK[minPlan] ?? 0;
  return u >= m;
}

// ── Widgets per plan (alineado con POST /api/widgets) ─────────────────────────

export const WIDGET_LIMITS: Record<string, number> = {
  free: 1,
  starter: 3,
  growth: 6,
  business: 12,
  enterprise: 999,
};

export function getWidgetLimit(plan: string): number {
  return WIDGET_LIMITS[plan] ?? WIDGET_LIMITS.free;
}
