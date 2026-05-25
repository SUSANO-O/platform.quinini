#!/usr/bin/env node
/**
 * Asigna un modelo del catálogo a un agente (landing + hub Mongo + PUT AIBackHub).
 *   node --env-file=.env scripts/assign-agent-model.mjs <agentMongoId> [modelId]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection, Types } from 'mongoose';

const AGENT_ID = process.argv[2];
const MODEL = process.argv[3] || 'vx/gemini-3.1-pro-preview';
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
loadEnvFile(resolve(root, '.env'));
loadEnvFile(resolve(root, '../AIBackHub/.env'));

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (process.env[key] == null || process.env[key] === '') process.env[key] = val;
    }
  } catch { /* */ }
}

function hubBase() {
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

function hubHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const apiKey = process.env.AIBACKHUB_API_KEY?.trim();
  if (apiKey) h['x-api-key'] = apiKey;
  const tenant = process.env.AIBACKHUB_TENANT_ID?.trim();
  if (tenant) h['x-tenant-id'] = tenant;
  return h;
}

async function main() {
  if (!AGENT_ID || !Types.ObjectId.isValid(AGENT_ID)) {
    console.error('Uso: node scripts/assign-agent-model.mjs <agentMongoId> [modelId]');
    process.exit(1);
  }
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('Falta MONGODB_URI');
  const hubUri =
    process.env.AIBACKHUB_MONGO_URI?.trim() ||
    uri.replace(/agentflowhub_landing/i, 'agentflow');

  const landing = await createConnection(uri).asPromise();
  const hub = await createConnection(hubUri).asPromise();
  const agents = landing.db.collection('clientagents');
  const oid = new Types.ObjectId(AGENT_ID);
  const agent = await agents.findOne({ _id: oid });
  if (!agent) {
    console.error('Agente no encontrado:', AGENT_ID);
    process.exit(1);
  }

  const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
  const now = new Date();

  await agents.updateOne(
    { _id: oid },
    { $set: { model: MODEL, syncStatus: hubId ? 'pending' : 'synced', updatedAt: now } },
  );

  let hubUpdate = null;
  if (hubId) {
    hubUpdate = await hub.db.collection('agents').updateOne(
      { id: hubId },
      { $set: { model: MODEL, updatedAt: now.toISOString() } },
    );
    if (hubUpdate.modifiedCount > 0 || hubUpdate.matchedCount > 0) {
      await agents.updateOne({ _id: oid }, { $set: { syncStatus: 'synced', updatedAt: new Date() } });
    }
  }

  let apiSync = null;
  const base = hubBase();
  if (base && hubId) {
    try {
      const payload = {
        name: agent.name,
        description: (agent.description || '').trim(),
        prompt: agent.systemPrompt,
        model: MODEL,
        ragEnabled: Boolean(agent.ragEnabled),
        ragSources: Array.isArray(agent.ragSources) ? agent.ragSources : [],
        catalogAgentType: agent.type === 'sub-agent' ? 'sub-agent' : 'agent',
        strictPurposeOnly: agent.strictPurposeOnly !== false,
        landingClientAgentId: String(agent._id),
      };
      const res = await fetch(`${base}/api/agents/${encodeURIComponent(hubId)}`, {
        method: 'PUT',
        headers: hubHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
      apiSync = { ok: res.ok, status: res.status };
      if (res.ok) {
        await agents.updateOne({ _id: oid }, { $set: { syncStatus: 'synced', updatedAt: new Date() } });
      }
    } catch (err) {
      apiSync = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const afterLanding = await agents.findOne({ _id: oid }, { projection: { model: 1, syncStatus: 1, agentHubId: 1 } });
  const afterHub = hubId ? await hub.db.collection('agents').findOne({ id: hubId }, { projection: { model: 1 } }) : null;

  console.log(JSON.stringify({
    agentId: AGENT_ID,
    hubId: hubId || null,
    model: MODEL,
    landing: afterLanding,
    hub: afterHub,
    hubMongoModified: hubUpdate?.modifiedCount ?? 0,
    apiSync,
  }, null, 2));

  await landing.close();
  await hub.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
