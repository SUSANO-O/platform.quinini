import { ensureClientAgentHubSynced, fetchCatalogAgentFromHub, getAgentflowhubBaseUrl } from '@/lib/aibackhub-sync';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';

/** Reintenta con localhost ↔ 127.0.0.1 (a veces solo uno resuelve en Windows). */
export function alternateHubOrigin(base: string): string | null {
  try {
    const u = new URL(base);
    if (u.hostname === '127.0.0.1') {
      u.hostname = 'localhost';
      return u.origin;
    }
    if (u.hostname === 'localhost') {
      u.hostname = '127.0.0.1';
      return u.origin;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getHubWidgetChatUrl(base?: string): string {
  const b = (base ?? getAgentflowhubBaseUrl()).replace(/\/$/, '');
  return `${b}/api/widget/chat`;
}

export async function fetchHubWidgetChat(base: string, init: RequestInit): Promise<Response> {
  const url = getHubWidgetChatUrl(base);
  try {
    return await fetch(url, init);
  } catch (first) {
    const alt = alternateHubOrigin(base);
    if (!alt) throw first;
    try {
      return await fetch(getHubWidgetChatUrl(alt), init);
    } catch {
      throw first;
    }
  }
}

export type HubProxyConfigError = {
  code: string;
  message: string;
  hint?: string;
  details?: string;
};

export function validateHubProxyConfig(requestOrigin: string): HubProxyConfigError | null {
  if (!process.env.AGENTFLOWHUB_URL?.trim() && process.env.VERCEL === '1') {
    return {
      code: 'AGENTFLOWHUB_URL_MISSING',
      message:
        'Falta AGENTFLOWHUB_URL en variables de entorno. Define la URL pública https://… de AgentFlowhub.',
      hint:
        'Valor típico: https://tu-agentflowhub.vercel.app — no uses la URL de esta landing como hub.',
    };
  }

  const base = getAgentflowhubBaseUrl();
  if (base === requestOrigin) {
    return {
      code: 'HUB_CHAT_PROXY_LOOP',
      message: 'Configuración inválida: AGENTFLOWHUB_URL apunta a este mismo dominio.',
      hint: 'En producción, AGENTFLOWHUB_URL debe ser el dominio real de AgentFlowhub (no el de la landing).',
    };
  }

  if (process.env.VERCEL === '1') {
    try {
      const u = new URL(base);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        return {
          code: 'AGENTFLOWHUB_URL_LOCALHOST',
          message: 'AGENTFLOWHUB_URL apunta a localhost en el servidor de producción.',
          hint:
            'En Vercel, define AGENTFLOWHUB_URL con la URL pública de AgentFlowhub (https://…), no 127.0.0.1.',
        };
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

export function formatHubFetchError(err: unknown, base: string): HubProxyConfigError {
  const msg = err instanceof Error ? err.message : String(err);
  const isLocal = /127\.0\.0\.1|localhost/i.test(base);
  return {
    code: 'HUB_CHAT_PROXY_FAILED',
    message: 'El agente está con muchas peticiones, disculpa las molestias. Espera unos segundos e inténtalo de nuevo o puedes escribirnos a :',
    details: msg,
    hint: isLocal
      ? `Arranca AgentFlowhub en ${base} (API suele ser :9002; UI :9010) y AIBackHub en BACKEND_URL. Revisa AGENTFLOWHUB_URL en .env.`
      : `Comprueba AGENTFLOWHUB_URL (${base}): debe ser accesible desde el servidor donde corre la landing.`,
  };
}

/** Sustituye agentId Mongo por agentHubId del catálogo antes de llamar al hub. */
export async function resolveHubAgentIdInBody(
  rawBody: string,
  userId?: string,
): Promise<
  | { ok: true; body: string; hubAgentId: string }
  | { ok: false; code: string; message: string; hint?: string }
> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { ok: true, body: rawBody, hubAgentId: '' };
  }

  const aid = typeof parsed.agentId === 'string' ? parsed.agentId.trim() : '';
  if (!aid || !/^[a-f0-9]{24}$/i.test(aid)) {
    return { ok: true, body: rawBody, hubAgentId: aid };
  }

  const hubId = await ensureClientAgentHubSynced(aid, userId);
  if (hubId) {
    parsed.agentId = hubId;
    return { ok: true, body: JSON.stringify(parsed), hubAgentId: hubId };
  }

  await connectDB();
  const landingAgent = await ClientAgent.findById(aid).select({ _id: 1 }).lean();
  if (!landingAgent) {
    const inHub = await fetchCatalogAgentFromHub(aid);
    if (inHub?.id) {
      return { ok: true, body: rawBody, hubAgentId: inHub.id };
    }
  }

  return {
    ok: false,
    code: 'AGENT_HUB_SYNC_REQUIRED',
    message: 'El agente aún no está sincronizado con el motor de IA.',
    hint:
      'Abre el agente en el dashboard y reintenta la sync con el hub, o crea de nuevo el widget con Quick Start.',
  };
}
