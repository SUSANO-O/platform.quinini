/**
 * Clona la conexión MCP HubSpot de un agente landing a otro (mismas credenciales).
 * No imprime secretos.
 *
 *   npx tsx --env-file=.env scripts/clone-hubspot-mcp.mts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createConnection, Types } from 'mongoose';

const APPLY = process.argv.includes('--apply');
const POS = process.argv.slice(2).filter((a) => a !== '--apply');
const FROM_ID = POS[0] || '69d5084c78e0af3d5536fe95';
const TO_ID = POS[1] || '6a80f6a6543cb99549025dd2';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(resolve(__dirname, '../.env'));
loadEnvFile(resolve(__dirname, '../../matias-backend/.env'));
loadEnvFile(resolve(__dirname, '../../AIBackHub/.env'));

const HUB_MONGO =
  process.env.AIBACKHUB_MONGO_URI?.trim() ||
  process.env.HUB_MONGODB_URI?.trim() ||
  process.env.MONGODB_URI?.replace(/agentflowhub_landing/i, 'agentflow') ||
  '';

const HUBSPOT_TOOL_IDS = [
  'mcp:hubspot:hubspot_search_contacts',
  'mcp:hubspot:hubspot_create_contact',
  'mcp:hubspot:hubspot_create_deal',
  'mcp:hubspot:hubspot_get_contact',
];

function credKeys(creds: Record<string, string> | undefined) {
  if (!creds || typeof creds !== 'object') return [];
  return Object.entries(creds).map(([k, v]) => ({
    key: k,
    filled: typeof v === 'string' && v.trim().length > 0,
    len: typeof v === 'string' ? v.trim().length : 0,
  }));
}

function summarizeConn(c: Record<string, unknown>) {
  return {
    id: c.id,
    agentId: c.agentId,
    landingClientAgentId: c.landingClientAgentId ?? null,
    integrationKey: c.integrationKey,
    label: c.label,
    syncStatus: c.syncStatus,
    lastSyncError: c.lastSyncError ?? null,
    toolsSnapshot: c.toolsSnapshot ?? [],
    credentialFields: credKeys(c.credentials as Record<string, string>),
  };
}

async function loadAgent(col: { findOne: (q: object) => Promise<Record<string, unknown> | null> }, id: string) {
  const oid = Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
  if (!oid) return null;
  return col.findOne({ _id: oid });
}

async function main() {
  if (!process.env.MONGODB_URI?.trim() || !HUB_MONGO) {
    console.error('Falta MONGODB_URI o URI del hub.');
    process.exit(1);
  }

  const landing = await createConnection(process.env.MONGODB_URI).asPromise();
  const hub = await createConnection(HUB_MONGO).asPromise();
  const agents = landing.db.collection('clientagents');
  const conns = hub.db.collection('mcp_connections');
  const hubAgents = hub.db.collection('agents');

  const from = await loadAgent(agents, FROM_ID);
  const to = await loadAgent(agents, TO_ID);
  if (!from || !to) {
    console.error('Agente no encontrado', { from: Boolean(from), to: Boolean(to) });
    process.exit(1);
  }

  const fromHub = String(from.agentHubId || '');
  const toHub = String(to.agentHubId || '');
  const tenantId = process.env.AIBACKHUB_TENANT_ID?.trim() || 'default';

  const fromIds = [...new Set([fromHub, FROM_ID].filter(Boolean))];
  const toIds = [...new Set([toHub, TO_ID].filter(Boolean))];

  const sourceConns = await conns
    .find({
      tenantId,
      integrationKey: 'hubspot',
      $or: [
        { agentId: { $in: fromIds } },
        { landingClientAgentId: FROM_ID },
      ],
    })
    .toArray();

  const destConns = await conns
    .find({
      tenantId,
      integrationKey: 'hubspot',
      $or: [
        { agentId: { $in: toIds } },
        { landingClientAgentId: TO_ID },
      ],
    })
    .toArray();

  const source = sourceConns[0];
  const destHubAgent = toHub ? await hubAgents.findOne({ id: toHub }) : null;

  const report: Record<string, unknown> = {
    apply: APPLY,
    from: {
      id: FROM_ID,
      name: from.name,
      agentHubId: fromHub || null,
      enabledMcpToolIds: from.enabledMcpToolIds ?? [],
      hubspotAutoCapture: from.hubspotAutoCaptureContacts === true,
    },
    to: {
      id: TO_ID,
      name: to.name,
      agentHubId: toHub || null,
      enabledMcpToolIds: to.enabledMcpToolIds ?? [],
      hubspotAutoCapture: to.hubspotAutoCaptureContacts === true,
    },
    sourceConnections: sourceConns.map(summarizeConn),
    destConnections: destConns.map(summarizeConn),
    destHubEnabledToolIds: destHubAgent?.enabledToolIds ?? null,
  };

  if (!APPLY) {
    report.note = 'Dry-run. Pasa --apply para clonar.';
    console.log(JSON.stringify(report, null, 2));
    await landing.close();
    await hub.close();
    return;
  }

  if (!source) {
    report.error = 'El origen no tiene conexión HubSpot. No se clonó nada.';
    console.log(JSON.stringify(report, null, 2));
    await landing.close();
    await hub.close();
    process.exit(2);
  }

  if (!toHub) {
    report.error = 'El destino no tiene agentHubId; no se puede colgar la conexión MCP.';
    console.log(JSON.stringify(report, null, 2));
    await landing.close();
    await hub.close();
    process.exit(2);
  }

  const creds = { ...((source.credentials as Record<string, string>) || {}) };
  if (!Object.values(creds).some((v) => String(v || '').trim())) {
    report.error = 'Credenciales origen vacías.';
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  let destId = destConns[0]?.id as string | undefined;
  const now = new Date().toISOString();

  if (destId) {
    await conns.updateOne(
      { tenantId, id: destId },
      {
        $set: {
          credentials: creds,
          label: source.label || 'HubSpot',
          agentId: toHub,
          landingClientAgentId: TO_ID,
          integrationKey: 'hubspot',
          syncStatus: 'pending',
          updatedAt: now,
        },
      },
    );
    report.action = 'updated-existing';
  } else {
    destId = randomUUID();
    await conns.insertOne({
      id: destId,
      tenantId,
      agentId: toHub,
      landingClientAgentId: TO_ID,
      integrationKey: 'hubspot',
      label: source.label || 'HubSpot',
      credentials: creds,
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    report.action = 'inserted';
  }

  const srcTools = Array.isArray(from.enabledMcpToolIds)
    ? (from.enabledMcpToolIds as string[]).filter((id) => String(id).startsWith('mcp:hubspot:'))
    : [];
  const tools = [...new Set([...(srcTools.length ? srcTools : HUBSPOT_TOOL_IDS), ...HUBSPOT_TOOL_IDS])];
  const destTools = Array.isArray(to.enabledMcpToolIds) ? [...(to.enabledMcpToolIds as string[])] : [];
  const merged = [...new Set([...destTools.filter((id) => !String(id).startsWith('mcp:hubspot:')), ...tools])];

  await agents.updateOne(
    { _id: new Types.ObjectId(TO_ID) },
    { $set: { enabledMcpToolIds: merged, hubspotAutoCaptureContacts: true, updatedAt: new Date() } },
  );

  if (destHubAgent) {
    const hubTools = Array.isArray(destHubAgent.enabledToolIds)
      ? destHubAgent.enabledToolIds.filter((id: string) => !String(id).startsWith('mcp:hubspot:'))
      : [];
    await hubAgents.updateOne(
      { id: toHub },
      { $set: { enabledToolIds: [...new Set([...hubTools, ...tools])], updatedAt: now } },
    );
  }

  const backend = (process.env.BACKEND_URL || process.env.AUTH_BACKEND_URL || '').replace(/\/$/, '');
  const apiKey = process.env.AIBACKHUB_API_KEY?.trim();
  let sync: Record<string, unknown> | null = null;
  if (backend && destId) {
    const res = await fetch(`${backend}/api/mcp/connections/${encodeURIComponent(destId)}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
        'x-tenant-id': tenantId,
      },
      signal: AbortSignal.timeout(120_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    sync = {
      status: res.status,
      ok: json.ok === true || res.ok,
      error: typeof json.error === 'string' ? json.error : null,
      tools: (json.data as { connection?: { toolsSnapshot?: string[] } } | undefined)?.connection?.toolsSnapshot
        ?? (json.connection as { toolsSnapshot?: string[] } | undefined)?.toolsSnapshot
        ?? null,
    };
  }

  report.destConnectionId = destId;
  report.enabledMcpToolIds = merged;
  report.sync = sync;
  console.log(JSON.stringify(report, null, 2));

  await landing.close();
  await hub.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
