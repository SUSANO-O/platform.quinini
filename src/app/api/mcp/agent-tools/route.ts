/**
 * GET /api/mcp/agent-tools?agentId=<landing-agent-id>
 *
 * Returns MCP connections (synced status) + their available tools,
 * grouped by integration server, for the tools tab in the dashboard.
 *
 * Resolves the hub agent ID by trying:
 *   1. agentHubId field on the landing agent
 *   2. AIBackHub agent with landingClientAgentId == landing agent _id
 *   3. Landing agent _id directly (fallback)
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';

/** ObjectId Mongo de 24 hex (evita tratar slugs como id válido). */
function isHexObjectId(id: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(id);
}

async function resolveLandingAgentLean(landingAgentId: string) {
  if (isHexObjectId(landingAgentId)) {
    const byId = await ClientAgent.findById(landingAgentId)
      .select('agentHubId syncStatus')
      .lean()
      .catch(() => null);
    if (byId) return byId;
  }
  return ClientAgent.findOne({ agentHubId: landingAgentId })
    .select('agentHubId syncStatus')
    .lean()
    .catch(() => null);
}

interface McpConnection {
  id: string;
  integrationKey: string;
  label: string;
  syncStatus: 'pending' | 'ok' | 'error';
  lastSyncAt?: string;
  lastSyncError?: string;
  /** IDs de tools descubiertas durante la sincronización MCP. */
  toolsSnapshot?: string[];
  /** En hub vienen enmascaradas (no son los valores reales). */
  credentials?: Record<string, string>;
}

interface McpCatalogField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
}

interface McpCatalogEntry {
  key: string;
  name: string;
  description: string;
  toolIdPrefix: string;
  credentialFields?: McpCatalogField[];
}

interface UnifiedToolEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  server?: string;
}

export interface McpServerGroup {
  integrationKey: string;
  serverName: string;
  description: string;
  syncStatus: 'ok' | 'pending' | 'error';
  connectionId: string;
  tools: { id: string; name: string; description: string }[];
  credentialFields: McpCatalogField[];
  credentialsMask: Record<string, string>;
  /** ISO: última comprobación hub ↔ servidor MCP remoto. */
  lastSyncAt?: string;
  lastSyncError?: string;
}

export type AgentHubLinkInfo = {
  hasAgentHubId: boolean;
  /** ID en catálogo AIBackHub (slug), si existe. */
  agentHubId: string | null;
  /** Estado sync landing ↔ catálogo (`pending` | `synced` | `failed`). */
  catalogSyncStatus: string;
};

type LandingAgentLean = {
  _id: mongoose.Types.ObjectId | string;
  agentHubId?: string;
  syncStatus?: string;
} | null;

async function resolveHubAgentIds(
  landingId: string,
  backendBase: string,
  headers: Record<string, string>,
  landingAgent: LandingAgentLean,
): Promise<string[]> {
  const candidates = new Set<string>();
  candidates.add(landingId);

  const agent = landingAgent;
  const landingMongoId =
    agent && typeof (agent as { _id?: unknown })._id !== 'undefined'
      ? String((agent as { _id: mongoose.Types.ObjectId | string })._id)
      : null;
  if (landingMongoId) candidates.add(landingMongoId);
  if (agent?.agentHubId && typeof agent.agentHubId === 'string') {
    candidates.add(agent.agentHubId.trim());
  }

  try {
    const res = await fetch(`${backendBase}/api/agents`, { headers });
    if (res.ok) {
      const body = await res.json();
      const raw = body?.data;
      const agents: { id: string; landingClientAgentId?: string }[] = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as { agents?: unknown }).agents)
          ? ((raw as { agents: { id: string; landingClientAgentId?: string }[] }).agents)
          : [];
      for (const a of agents) {
        const lc = a.landingClientAgentId;
        if (lc === landingId || (landingMongoId && lc === landingMongoId)) {
          candidates.add(a.id);
        }
        if (a.id === landingId) {
          candidates.add(a.id);
        }
      }
    }
  } catch { /* backend unreachable */ }

  return [...candidates];
}

export async function GET(req: NextRequest) {
  const landingAgentId = req.nextUrl.searchParams.get('agentId')?.trim();
  if (!landingAgentId) {
    return NextResponse.json({ error: 'agentId required' }, { status: 400 });
  }

  const backendBase = getAibackhubBaseUrl();
  if (!backendBase) {
    return NextResponse.json({ servers: [], note: 'BACKEND_URL not configured' });
  }

  await connectDB();
  const headers = hubCreateHeaders();

  const landingRow = await resolveLandingAgentLean(landingAgentId);
  const hubIdRaw =
    landingRow && typeof (landingRow as { agentHubId?: string }).agentHubId === 'string'
      ? (landingRow as { agentHubId: string }).agentHubId.trim()
      : '';
  const catalogSyncStatus =
    landingRow && typeof (landingRow as { syncStatus?: string }).syncStatus === 'string'
      ? (landingRow as { syncStatus: string }).syncStatus
      : 'unknown';

  const agentHubLink: AgentHubLinkInfo = {
    hasAgentHubId: Boolean(hubIdRaw),
    agentHubId: hubIdRaw || null,
    catalogSyncStatus,
  };

  const hubIds = await resolveHubAgentIds(landingAgentId, backendBase, headers, landingRow);

  let allConnections: McpConnection[] = [];
  for (const hid of hubIds) {
    const res = await fetch(
      `${backendBase}/api/mcp/connections?agentId=${encodeURIComponent(hid)}`,
      { headers },
    ).catch(() => null);
    if (!res?.ok) continue;
    const data = await res.json().catch(() => ({}));
    const conns: McpConnection[] = data?.data?.connections ?? data?.connections ?? [];
    allConnections.push(...conns);
  }

  const seenIds = new Set<string>();
  allConnections = allConnections.filter((c) => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  const [catalogRes, toolCatalogRes] = await Promise.all([
    fetch(`${backendBase}/api/mcp/catalog`, { headers }).catch(() => null),
    fetch(`${backendBase}/api/tools/unified`, { headers }).catch(() => null),
  ]);

  const catalogData = catalogRes?.ok ? await catalogRes.json().catch(() => ({})) : {};
  const toolCatalogData = toolCatalogRes?.ok ? await toolCatalogRes.json().catch(() => ({})) : {};

  const integrationCatalog: McpCatalogEntry[] =
    catalogData?.data?.catalog ?? catalogData?.catalog ?? [];
  const allTools: UnifiedToolEntry[] =
    toolCatalogData?.data?.catalog ?? toolCatalogData?.catalog ?? [];
  const mcpTools = allTools.filter(
    (t) => t.category === 'mcp' || (typeof t.id === 'string' && t.id.startsWith('mcp:')),
  );

  const catalogByKey = new Map(integrationCatalog.map((c) => [c.key, c]));

  const servers: McpServerGroup[] = [];
  for (const conn of allConnections) {
    const meta = catalogByKey.get(conn.integrationKey);
    const prefix = meta?.toolIdPrefix ?? `mcp:${conn.integrationKey}:`;

    const matchingTools = mcpTools
      .filter((t) => t.id.startsWith(prefix))
      .map((t) => ({
        id: t.id,
        name: humanToolName(t.name ?? t.id),
        description: t.description || '',
      }));

    let tools = matchingTools;
    if (
      conn.integrationKey === 'mcp_standard' &&
      Array.isArray(conn.toolsSnapshot) &&
      conn.toolsSnapshot.length > 0
    ) {
      const fromSnap = conn.toolsSnapshot.map((tid) => ({
        id: tid,
        name: humanToolName(tid.split(':').pop() ?? tid),
        description: '',
      }));
      if (tools.length === 0) {
        tools = fromSnap;
      } else {
        const seen = new Set(tools.map((x) => x.id));
        for (const t of fromSnap) {
          if (!seen.has(t.id)) {
            tools.push(t);
            seen.add(t.id);
          }
        }
      }
    }

    servers.push({
      integrationKey: conn.integrationKey,
      serverName: conn.label?.trim()
        ? `${meta?.name ?? conn.integrationKey} — ${conn.label}`
        : (meta?.name ?? conn.integrationKey),
      description: meta?.description ?? '',
      syncStatus: conn.syncStatus,
      connectionId: conn.id,
      tools,
      credentialFields: meta?.credentialFields ?? [],
      credentialsMask: conn.credentials && typeof conn.credentials === 'object' ? conn.credentials : {},
      lastSyncAt: typeof conn.lastSyncAt === 'string' ? conn.lastSyncAt : undefined,
      lastSyncError: typeof conn.lastSyncError === 'string' ? conn.lastSyncError : undefined,
    });
  }

  return NextResponse.json({ servers, agentHubLink });
}

function humanToolName(raw: string): string {
  return raw
    .replace(
      /^(gmail|hubspot|slack|google_calendar|calendar|weather|web_search|webSearch)_/i,
      '',
    )
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
