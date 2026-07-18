/**
 * MCP BotIvA API REST para Math-ais — conexión en AIBackHub + tools habilitadas.
 */
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import {
  canAttemptHubSync,
  getAibackhubBaseUrl,
  hubCreateHeaders,
  syncHubCatalogFromLandingAgentDoc,
} from '@/lib/aibackhub-sync';
import { resolveHubAgentIdForMcp } from '@/lib/mcp-landing-auth';
import { mathAisApiToolIds } from '@/lib/math-ais-api-mcp';
import { mathAisMongoToolIds } from '@/lib/math-ais-mcp';
import { checkBotivaApiHealth } from '@/lib/botiva-api-delegation';

const MATH_AIS_HUB = (process.env.INTERNAL_APP_ASSIST_AGENT_ID || 'math-ais').trim() || 'math-ais';

export type AssistApiMcpStatus = {
  mathAisAgentId: string | null;
  hubAgentId: string | null;
  apiToolsEnabled: boolean;
  apiHealthy: boolean;
  apiBaseUrl: string | null;
  connection: {
    id: string;
    label: string;
    syncStatus: string;
    lastSyncError: string | null;
    landingInternalUrl: string;
  } | null;
};

export function resolveAssistLandingInternalUrl(): string {
  const fromEnv =
    process.env.LANDING_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'http://127.0.0.1:3201';
  return fromEnv.replace(/\/$/, '');
}

async function findMathAisAgent() {
  await connectDB();
  return ClientAgent.findOne({ agentHubId: MATH_AIS_HUB }).select({
    _id: 1,
    agentHubId: 1,
    enabledMcpToolIds: 1,
  });
}

async function hubListConnections(hubAgentId: string) {
  const base = getAibackhubBaseUrl();
  if (!base) return [];
  const url = `${base.replace(/\/$/, '')}/api/mcp/connections?agentId=${encodeURIComponent(hubAgentId)}`;
  const res = await fetch(url, {
    headers: hubCreateHeaders(),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as {
    data?: { connections?: Array<Record<string, unknown>> };
    connections?: Array<Record<string, unknown>>;
  };
  return (data?.data?.connections ?? data?.connections ?? []) as Array<Record<string, unknown>>;
}

export async function getAssistApiMcpStatus(): Promise<AssistApiMcpStatus> {
  const health = await checkBotivaApiHealth();
  const agent = await findMathAisAgent();
  if (!agent) {
    return {
      mathAisAgentId: null,
      hubAgentId: null,
      apiToolsEnabled: false,
      apiHealthy: health.ok,
      apiBaseUrl: health.apiBaseUrl,
      connection: null,
    };
  }

  const landingId = String(agent._id);
  const hubAgentId = await resolveHubAgentIdForMcp(landingId);
  const enabled = Array.isArray(agent.enabledMcpToolIds) ? agent.enabledMcpToolIds : [];
  const apiToolsEnabled = mathAisApiToolIds().every((id) => enabled.includes(id));

  let connection: AssistApiMcpStatus['connection'] = null;
  if (hubAgentId) {
    const conns = await hubListConnections(hubAgentId);
    const apiConn = conns.find((c) => String(c.integrationKey || '') === 'botiva_api');
    if (apiConn) {
      const creds = (apiConn.credentials || {}) as Record<string, string>;
      connection = {
        id: String(apiConn.id || apiConn._id || ''),
        label: String(apiConn.label || 'BotIvA API REST'),
        syncStatus: String(apiConn.syncStatus || 'unknown'),
        lastSyncError: apiConn.lastSyncError ? String(apiConn.lastSyncError) : null,
        landingInternalUrl: String(creds.landingInternalUrl || resolveAssistLandingInternalUrl()),
      };
    }
  }

  return {
    mathAisAgentId: landingId,
    hubAgentId,
    apiToolsEnabled,
    apiHealthy: health.ok,
    apiBaseUrl: health.apiBaseUrl,
    connection,
  };
}

export async function ensureAssistApiMcpConnection(params?: {
  landingInternalUrl?: string;
  label?: string;
}): Promise<{ ok: boolean; message: string; status: AssistApiMcpStatus }> {
  const landingInternalUrl = (params?.landingInternalUrl || resolveAssistLandingInternalUrl()).replace(
    /\/$/,
    '',
  );

  if (!canAttemptHubSync()) {
    return {
      ok: false,
      message: 'BACKEND_URL / AIBackHub no configurado en la landing.',
      status: await getAssistApiMcpStatus(),
    };
  }

  const health = await checkBotivaApiHealth();
  if (!health.ok) {
    return {
      ok: false,
      message: `API REST no alcanzable (${health.apiBaseUrl}): ${health.message}`,
      status: await getAssistApiMcpStatus(),
    };
  }

  const agent = await findMathAisAgent();
  if (!agent) {
    return {
      ok: false,
      message: 'Agente Math-ais no encontrado. Ejecuta «Asegurar agentes» en admin.',
      status: await getAssistApiMcpStatus(),
    };
  }

  const landingId = String(agent._id);
  const hubAgentId = await resolveHubAgentIdForMcp(landingId);
  if (!hubAgentId) {
    return {
      ok: false,
      message: 'Math-ais sin agentHubId en el hub. Sincroniza el agente primero.',
      status: await getAssistApiMcpStatus(),
    };
  }

  const credentials: Record<string, string> = {
    landingInternalUrl,
  };

  const base = getAibackhubBaseUrl()!.replace(/\/$/, '');
  const existing = (await hubListConnections(hubAgentId)).find(
    (c) => String(c.integrationKey || '') === 'botiva_api',
  );

  let connectionId = existing ? String(existing.id || existing._id || '') : '';

  if (connectionId) {
    const patchRes = await fetch(`${base}/api/mcp/connections/${encodeURIComponent(connectionId)}`, {
      method: 'PATCH',
      headers: { ...hubCreateHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!patchRes.ok) {
      const err = await patchRes.text();
      return {
        ok: false,
        message: `No se pudo actualizar credenciales API: ${err.slice(0, 200)}`,
        status: await getAssistApiMcpStatus(),
      };
    }
  } else {
    const postRes = await fetch(`${base}/api/mcp/connections`, {
      method: 'POST',
      headers: { ...hubCreateHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: hubAgentId,
        landingClientAgentId: landingId,
        integrationKey: 'botiva_api',
        label: params?.label || 'BotIvA — Math-ais (API REST)',
        credentials,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const postData = (await postRes.json().catch(() => ({}))) as {
      data?: { connection?: { id?: string } };
      connection?: { id?: string };
      error?: string;
    };
    if (!postRes.ok) {
      return {
        ok: false,
        message: postData.error || `Error al crear conexión API (${postRes.status})`,
        status: await getAssistApiMcpStatus(),
      };
    }
    connectionId = String(postData?.data?.connection?.id || postData?.connection?.id || '');
  }

  if (connectionId) {
    await fetch(`${base}/api/mcp/connections/${encodeURIComponent(connectionId)}/sync`, {
      method: 'POST',
      headers: hubCreateHeaders(),
      signal: AbortSignal.timeout(120_000),
    }).catch(() => {});
  }

  const mergedTools = [...new Set([...mathAisMongoToolIds(), ...mathAisApiToolIds()])];
  agent.set({ enabledMcpToolIds: mergedTools });
  await agent.save();
  await syncHubCatalogFromLandingAgentDoc(agent);

  const status = await getAssistApiMcpStatus();
  return {
    ok: status.connection?.syncStatus === 'ok' || Boolean(status.connection),
    message:
      status.connection?.syncStatus === 'ok'
        ? `API REST conectada (${health.apiBaseUrl}). Math-ais puede ejecutar /api/v1 para el usuario logueado.`
        : `Conexión guardada. Revisa sync: ${status.connection?.syncStatus || 'pending'}`,
    status,
  };
}
