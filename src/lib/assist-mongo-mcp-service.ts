/**
 * MCP MongoDB de plataforma para Math-ais (solo admin / scripts).
 * La URI nunca se persiste en git — solo en AIBackHub cifrado o env temporal.
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
import { mathAisMongoToolIds } from '@/lib/math-ais-mcp';

const MATH_AIS_HUB = (process.env.INTERNAL_APP_ASSIST_AGENT_ID || 'math-ais').trim() || 'math-ais';

export type AssistMongoMcpStatus = {
  mathAisAgentId: string | null;
  hubAgentId: string | null;
  mongoToolsEnabled: boolean;
  connection: {
    id: string;
    label: string;
    syncStatus: string;
    lastSyncError: string | null;
    hasUri: boolean;
    allowedDatabases: string;
  } | null;
};

function parseDbFromUri(uri: string): string {
  const trimmed = uri.trim();
  try {
    const u = new URL(trimmed.replace(/^mongodb(\+srv)?:\/\//, 'https://'));
    const path = u.pathname.replace(/^\//, '').split('/')[0];
    if (path) return path;
  } catch {
    /* fallback */
  }
  const m = trimmed.match(/\/([^/?]+)(\?|$)/);
  return m?.[1] || 'agentflowhub_landing';
}

/** Base Mongo de la landing (usuarios, agentes, widgets). NO usar agentfarm (motor). */
export function resolveAssistMongoUri(explicit?: string): string {
  const fromArg = (explicit || process.env.ASSIST_MONGO_URI || '').trim();
  if (fromArg) return fromArg;
  const landing = (process.env.MONGODB_URI || '').trim();
  if (landing) return landing;
  return '';
}

export function resolveAssistMongoDatabase(uri: string): string {
  const db = parseDbFromUri(uri);
  if (db === 'agentfarm') {
    return 'agentflowhub_landing';
  }
  return db;
}

/** Si la URI apunta a agentfarm, reescribe a la base landing (mismo cluster). */
export function normalizeAssistMongoUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return trimmed;
  if (parseDbFromUri(trimmed) === 'agentfarm') {
    return trimmed.replace(/\/agentfarm(\?|$)/, '/agentflowhub_landing$1');
  }
  return trimmed;
}

async function findMathAisAgent() {
  await connectDB();
  return ClientAgent.findOne({ agentHubId: MATH_AIS_HUB }).select({
    _id: 1,
    agentHubId: 1,
    enabledMcpToolIds: 1,
    hubspotAutoCaptureContacts: 1,
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

export async function getAssistMongoMcpStatus(): Promise<AssistMongoMcpStatus> {
  const agent = await findMathAisAgent();
  if (!agent) {
    return {
      mathAisAgentId: null,
      hubAgentId: null,
      mongoToolsEnabled: false,
      connection: null,
    };
  }

  const landingId = String(agent._id);
  const hubAgentId = await resolveHubAgentIdForMcp(landingId);
  const enabled = Array.isArray(agent.enabledMcpToolIds) ? agent.enabledMcpToolIds : [];
  const mongoToolsEnabled = mathAisMongoToolIds().every((id) => enabled.includes(id));

  let connection: AssistMongoMcpStatus['connection'] = null;
  if (hubAgentId) {
    const conns = await hubListConnections(hubAgentId);
    const mongo = conns.find((c) => String(c.integrationKey || '') === 'mongodb');
    if (mongo) {
      const creds = (mongo.credentials || {}) as Record<string, string>;
      connection = {
        id: String(mongo.id || mongo._id || ''),
        label: String(mongo.label || 'MongoDB Math-ais'),
        syncStatus: String(mongo.syncStatus || 'unknown'),
        lastSyncError: mongo.lastSyncError ? String(mongo.lastSyncError) : null,
        hasUri: Boolean(creds.connectionUri),
        allowedDatabases: String(creds.allowedDatabases || ''),
      };
    }
  }

  return {
    mathAisAgentId: landingId,
    hubAgentId,
    mongoToolsEnabled,
    connection,
  };
}

export async function ensureAssistMongoMcpConnection(params: {
  connectionUri: string;
  allowedDatabases?: string;
  label?: string;
}): Promise<{ ok: boolean; message: string; status: AssistMongoMcpStatus }> {
  const rawUri = params.connectionUri.trim();
  if (!rawUri.startsWith('mongodb://') && !rawUri.startsWith('mongodb+srv://')) {
    return {
      ok: false,
      message: 'URI inválida (debe ser mongodb:// o mongodb+srv://).',
      status: await getAssistMongoMcpStatus(),
    };
  }
  const uri = normalizeAssistMongoUri(rawUri);

  if (!canAttemptHubSync()) {
    return {
      ok: false,
      message: 'BACKEND_URL / AIBackHub no configurado en la landing.',
      status: await getAssistMongoMcpStatus(),
    };
  }

  const agent = await findMathAisAgent();
  if (!agent) {
    return {
      ok: false,
      message: 'Agente Math-ais no encontrado. Ejecuta «Asegurar agentes» en admin.',
      status: await getAssistMongoMcpStatus(),
    };
  }

  const landingId = String(agent._id);
  const hubAgentId = await resolveHubAgentIdForMcp(landingId);
  if (!hubAgentId) {
    return {
      ok: false,
      message: 'Math-ais sin agentHubId en el hub. Sincroniza el agente primero.',
      status: await getAssistMongoMcpStatus(),
    };
  }

  const dbName =
    (params.allowedDatabases || resolveAssistMongoDatabase(uri)).trim() || 'agentflowhub_landing';
  if (dbName === 'agentfarm') {
    return {
      ok: false,
      message:
        'La base agentfarm es del motor IA, no de clientes. Usa agentflowhub_landing (landing BotIvA).',
      status: await getAssistMongoMcpStatus(),
    };
  }
  const credentials: Record<string, string> = {
    connectionUri: uri,
    accessMode: 'read_only',
    maxRows: '50',
    allowedDatabases: dbName,
  };

  const base = getAibackhubBaseUrl()!.replace(/\/$/, '');
  const existing = (await hubListConnections(hubAgentId)).find(
    (c) => String(c.integrationKey || '') === 'mongodb',
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
        message: `No se pudo actualizar credenciales: ${err.slice(0, 200)}`,
        status: await getAssistMongoMcpStatus(),
      };
    }
  } else {
    const postRes = await fetch(`${base}/api/mcp/connections`, {
      method: 'POST',
      headers: { ...hubCreateHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: hubAgentId,
        landingClientAgentId: landingId,
        integrationKey: 'mongodb',
        label: params.label || 'BotIvA — Math-ais (solo lectura)',
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
        message: postData.error || `Error al crear conexión (${postRes.status})`,
        status: await getAssistMongoMcpStatus(),
      };
    }
    connectionId = String(
      postData?.data?.connection?.id || postData?.connection?.id || '',
    );
  }

  if (connectionId) {
    await fetch(`${base}/api/mcp/connections/${encodeURIComponent(connectionId)}/sync`, {
      method: 'POST',
      headers: hubCreateHeaders(),
      signal: AbortSignal.timeout(120_000),
    }).catch(() => {});
  }

  agent.set({
    enabledMcpToolIds: mathAisMongoToolIds(),
    hubspotAutoCaptureContacts: false,
  });
  await agent.save();
  await syncHubCatalogFromLandingAgentDoc(agent);

  const status = await getAssistMongoMcpStatus();
  return {
    ok: status.connection?.syncStatus === 'ok' || status.connection?.hasUri === true,
    message:
      status.connection?.syncStatus === 'ok'
        ? `MongoDB conectado (base ${dbName}). Math-ais puede leer datos del cliente logueado.`
        : `Conexión guardada. Revisa sync: ${status.connection?.syncStatus || 'pending'}`,
    status,
  };
}
