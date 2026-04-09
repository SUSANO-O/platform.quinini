/**
 * Helpers for server-to-server calls to AIBackHub (Express).
 * Mirrors AgentFlowhub's BACKEND_URL normalization (localhost → 127.0.0.1 on Windows).
 */

export function getAibackhubBaseUrl(): string {
  const raw = (process.env.BACKEND_URL || process.env.AUTH_BACKEND_URL || '').replace(/\/$/, '');
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
    return u.origin;
  } catch {
    return raw;
  }
}

/** Headers para llamadas a AIBackHub. x-api-key si AIBACKHUB_API_KEY está definida (coincide con API_KEY del backend). */
export function hubCreateHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = process.env.AIBACKHUB_API_KEY?.trim();
  if (apiKey) h['x-api-key'] = apiKey;
  return h;
}

/** AIBackHub sendCreated returns { success: true, data: { id, ... } }. */
export function parseCreatedAgentId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  if (typeof d.id === 'string') return d.id;
  const inner = d.data;
  if (inner && typeof inner === 'object' && typeof (inner as { id?: unknown }).id === 'string') {
    return (inner as { id: string }).id;
  }
  const agent = d.agent;
  if (agent && typeof agent === 'object' && typeof (agent as { id?: unknown }).id === 'string') {
    return (agent as { id: string }).id;
  }
  return undefined;
}

/** True si hay URL de backend; la API key es opcional si AIBackHub no define API_KEY. */
export function canAttemptHubSync(): boolean {
  return Boolean(getAibackhubBaseUrl());
}

/** Catálogo de agentes en AIBackHub (colección `agents`), alineado con AgentFlowhub + landing RAG/jerarquía. */
export type HubCatalogAgent = {
  id: string;
  name: string;
  description?: string;
  prompt?: string;
  model?: string;
  inferenceTemperature?: number | null;
  inferenceMaxTokens?: number | null;
  source?: 'landing' | 'agentflowhub' | 'api' | 'seed';
  landingClientAgentId?: string;
  landingParentClientAgentId?: string | null;
  catalogAgentType?: 'agent' | 'sub-agent';
  ragEnabled?: boolean;
  ragSources?: unknown[];
  hasWidget?: boolean;
  widgetPublicToken?: string;
  isPlatform?: boolean;
  /** Catálogo hub: Active | Inactive | Error */
  status?: string;
};

/**
 * GET /api/agents en AIBackHub — lista completa del catálogo (para importar plataforma a la landing).
 */
export async function fetchHubAgentsList(): Promise<HubCatalogAgent[]> {
  const base = getAibackhubBaseUrl();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/agents`, {
      headers: hubCreateHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { success?: boolean; data?: unknown };
    const data = json?.data ?? json;
    if (!Array.isArray(data)) return [];
    return data as HubCatalogAgent[];
  } catch {
    return [];
  }
}

/**
 * PUT catálogo en AIBackHub tras editar el agente en la landing.
 * No bloquea la respuesta del usuario si falla.
 */
export async function pushClientAgentToHubCatalog(agent: {
  agentHubId: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  inferenceTemperature?: number | null;
  inferenceMaxTokens?: number | null;
  /** `_id` del ClientAgent en Mongo landing — el hub guarda `landingClientAgentId` para notificar cambios. */
  landingClientAgentMongoId?: string;
  ragEnabled?: boolean;
  ragSources?: unknown[];
  type?: 'agent' | 'sub-agent';
  /** `_id` del padre en Mongo landing (hex 24), solo sub-agentes. */
  parentAgentId?: string | null;
  /** Token público del widget (catálogo). Omitir si no está en Mongo para no pisar el hub. */
  widgetPublicToken?: string | null;
  isPlatform?: boolean;
}): Promise<boolean> {
  const base = getAibackhubBaseUrl();
  const hid = String(agent.agentHubId || '').trim();
  if (!base || !hid) return false;
  const url = `${base}/api/agents/${encodeURIComponent(hid)}`;
  try {
    const payload: Record<string, unknown> = {
      name: agent.name,
      description: agent.description,
      prompt: agent.systemPrompt,
      model: agent.model,
    };
    if (agent.inferenceTemperature !== undefined) {
      payload.inferenceTemperature = agent.inferenceTemperature;
    }
    if (agent.inferenceMaxTokens !== undefined) {
      payload.inferenceMaxTokens = agent.inferenceMaxTokens;
    }
    if (agent.landingClientAgentMongoId && /^[a-f0-9]{24}$/i.test(agent.landingClientAgentMongoId)) {
      payload.landingClientAgentId = agent.landingClientAgentMongoId;
    }
    if (typeof agent.ragEnabled === 'boolean') {
      payload.ragEnabled = agent.ragEnabled;
    }
    if (agent.ragSources !== undefined) {
      payload.ragSources = agent.ragSources;
    }
    if (agent.parentAgentId && /^[a-f0-9]{24}$/i.test(agent.parentAgentId)) {
      payload.catalogAgentType = 'sub-agent';
      payload.landingParentClientAgentId = agent.parentAgentId;
    } else if (agent.type === 'agent' || agent.parentAgentId === null) {
      payload.catalogAgentType = 'agent';
      payload.landingParentClientAgentId = null;
    }
    if (agent.widgetPublicToken !== undefined) {
      const wt = agent.widgetPublicToken === null ? '' : String(agent.widgetPublicToken).trim();
      payload.hasWidget = Boolean(wt);
      payload.widgetPublicToken = wt;
    }
    if (typeof agent.isPlatform === 'boolean') {
      payload.isPlatform = agent.isPlatform;
    }
    const res = await fetch(url, {
      method: 'PUT',
      headers: hubCreateHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(
        '[aibackhub-sync] PUT /api/agents/',
        hid,
        'failed',
        res.status,
        errText.slice(0, 400),
      );
    }
    return res.ok;
  } catch (e) {
    console.warn('[aibackhub-sync] PUT catalog error', e);
    return false;
  }
}

/**
 * GET /api/agents/:id en AIBackHub — mismo documento que edita AgentFlowhub.
 * Devuelve null si no hay backend, 404 o error de red.
 */
export async function fetchCatalogAgentFromHub(agentHubId: string): Promise<HubCatalogAgent | null> {
  const base = getAibackhubBaseUrl();
  if (!base || !agentHubId.trim()) return null;
  const url = `${base}/api/agents/${encodeURIComponent(agentHubId)}`;
  try {
    const res = await fetch(url, {
      headers: hubCreateHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; data?: HubCatalogAgent };
    const data = json?.data ?? (json as unknown as HubCatalogAgent);
    if (!data || typeof data !== 'object' || typeof (data as HubCatalogAgent).id !== 'string') {
      return null;
    }
    return data as HubCatalogAgent;
  } catch {
    return null;
  }
}

/** AgentFlowhub (Next) — widget chat proxy; default dev port 9002. */
export function getAgentflowhubBaseUrl(): string {
  const raw = (process.env.AGENTFLOWHUB_URL || 'http://127.0.0.1:9002').replace(/\/$/, '');
  try {
    const u = new URL(raw);
    if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
    return u.origin;
  } catch {
    return raw;
  }
}
