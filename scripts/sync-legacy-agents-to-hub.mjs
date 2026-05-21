#!/usr/bin/env node
/**
 * Sincroniza agentes/sub-agentes de la landing sin agentHubId válido → AIBackHub.
 * node --env-file=.env scripts/sync-legacy-agents-to-hub.mjs
 * DRY_RUN=1  → solo lista candidatos
 */
import { createConnection } from 'mongoose';

const uri = process.env.MONGODB_URI || '';
const DRY = process.env.DRY_RUN === '1';
const backendRaw = (process.env.BACKEND_URL || process.env.AUTH_BACKEND_URL || '').replace(/\/$/, '');
const apiKey = process.env.AIBACKHUB_API_KEY?.trim() || '';

function hubBase() {
  if (!backendRaw) return '';
  try {
    const u = new URL(backendRaw);
    if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
    return u.origin;
  } catch {
    return backendRaw;
  }
}

function hubHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (apiKey) h['x-api-key'] = apiKey;
  const tenant = process.env.AIBACKHUB_TENANT_ID?.trim();
  if (tenant) h['x-tenant-id'] = tenant;
  return h;
}

function parseCreatedId(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.id === 'string') return data.id;
  if (data.data && typeof data.data.id === 'string') return data.data.id;
  if (data.agent && typeof data.agent.id === 'string') return data.agent.id;
  return null;
}

async function fetchHubList(base) {
  const res = await fetch(`${base}/api/agents`, {
    headers: hubHeaders(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
}

async function fetchHubAgent(base, hubId) {
  const res = await fetch(`${base}/api/agents/${encodeURIComponent(hubId)}`, {
    headers: hubHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok;
}

async function postCreateAgent(base, agent) {
  const mongoId = String(agent._id);
  const wt = typeof agent.widgetPublicToken === 'string' ? agent.widgetPublicToken.trim() : '';
  const payload = {
    name: agent.name,
    description: (agent.description || '').trim(),
    prompt: agent.systemPrompt,
    model: agent.model,
    hasWidget: Boolean(wt),
    source: 'landing',
    landingClientAgentId: mongoId,
    ragEnabled: Boolean(agent.ragEnabled),
    ragSources: Array.isArray(agent.ragSources) ? agent.ragSources : [],
    catalogAgentType: agent.type === 'sub-agent' ? 'sub-agent' : 'agent',
    strictPurposeOnly: agent.strictPurposeOnly !== false,
  };
  if (wt) payload.widgetPublicToken = wt;
  const parent = agent.parentAgentId ? String(agent.parentAgentId) : '';
  if (agent.type === 'sub-agent' && /^[a-f0-9]{24}$/i.test(parent)) {
    payload.landingParentClientAgentId = parent;
  }

  const res = await fetch(`${base}/api/agents`, {
    method: 'POST',
    headers: hubHeaders(),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `${res.status} ${text.slice(0, 200)}` };
  }
  const data = await res.json();
  return { ok: true, hubId: parseCreatedId(data) };
}

async function syncOne(conn, base, catalog, agent) {
  const mongoId = String(agent._id);
  const name = agent.name || mongoId;
  const existing = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';

  if (existing) {
    const inHub = await fetchHubAgent(base, existing);
    if (inHub) {
      await conn.collection('clientagents').updateOne(
        { _id: agent._id },
        { $set: { syncStatus: 'synced', agentHubId: existing } },
      );
      return { mongoId, name, status: 'already_ok', hubId: existing };
    }
  }

  const byLanding = catalog.find((a) => a.landingClientAgentId === mongoId);
  if (byLanding?.id) {
    if (!DRY) {
      await conn.collection('clientagents').updateOne(
        { _id: agent._id },
        { $set: { syncStatus: 'synced', agentHubId: byLanding.id } },
      );
    }
    return { mongoId, name, status: 'linked_from_catalog', hubId: byLanding.id };
  }

  if (DRY) {
    return { mongoId, name, status: 'would_create', hubId: null, type: agent.type };
  }

  const created = await postCreateAgent(base, agent);
  if (created.ok && created.hubId) {
    await conn.collection('clientagents').updateOne(
      { _id: agent._id },
      { $set: { syncStatus: 'synced', agentHubId: created.hubId } },
    );
    return { mongoId, name, status: 'created', hubId: created.hubId, type: agent.type };
  }

  await conn.collection('clientagents').updateOne(
    { _id: agent._id },
    { $set: { syncStatus: 'failed' } },
  );
  return { mongoId, name, status: 'failed', error: created.error, type: agent.type };
}

async function main() {
  const base = hubBase();
  if (!uri) {
    console.error('MONGODB_URI required');
    process.exit(1);
  }
  if (!base) {
    console.error('BACKEND_URL required');
    process.exit(1);
  }

  console.log('=== Sync legacy agents → AIBackHub ===');
  console.log('Hub:', base);
  console.log('Mode:', DRY ? 'DRY_RUN' : 'APPLY');

  try {
    const h = await fetch(`${base}/health`, { signal: AbortSignal.timeout(8_000) });
    console.log('AIBackHub health:', h.status, h.ok ? 'OK' : 'FAIL');
  } catch (e) {
    console.error('AIBackHub unreachable:', e.message);
    process.exit(1);
  }

  const conn = await createConnection(uri).asPromise();
  const catalog = await fetchHubList(base);
  console.log('Catalog agents in hub:', catalog.length);

  const candidates = await conn
    .collection('clientagents')
    .find({
      isPlatform: { $ne: true },
      $or: [
        { agentHubId: { $in: [null, ''] } },
        { syncStatus: { $in: ['pending', 'failed'] } },
      ],
    })
    .project({
      name: 1,
      type: 1,
      parentAgentId: 1,
      agentHubId: 1,
      syncStatus: 1,
      systemPrompt: 1,
      model: 1,
      description: 1,
      ragEnabled: 1,
      ragSources: 1,
      widgetPublicToken: 1,
      strictPurposeOnly: 1,
    })
    .toArray();

  candidates.sort((a, b) => {
    const ta = a.type === 'sub-agent' ? 1 : 0;
    const tb = b.type === 'sub-agent' ? 1 : 0;
    return ta - tb;
  });

  console.log('\nCandidates:', candidates.length);
  if (!candidates.length) {
    console.log('Nothing to sync.');
    await conn.close();
    return;
  }

  const results = [];
  for (const agent of candidates) {
    const r = await syncOne(conn, base, catalog, agent);
    results.push(r);
    const icon =
      r.status === 'failed' ? '✗' : r.status === 'would_create' ? '?' : '✓';
    console.log(
      icon,
      r.type || agent.type || 'agent',
      '|',
      r.name,
      '|',
      r.status,
      r.hubId ? `→ ${r.hubId}` : '',
      r.error ? `| ${r.error}` : '',
    );
    if (r.status === 'created' && r.hubId) {
      catalog.push({ id: r.hubId, landingClientAgentId: r.mongoId });
    }
  }

  const summary = {
    already_ok: results.filter((r) => r.status === 'already_ok').length,
    linked: results.filter((r) => r.status === 'linked_from_catalog').length,
    created: results.filter((r) => r.status === 'created').length,
    failed: results.filter((r) => r.status === 'failed').length,
    would_create: results.filter((r) => r.status === 'would_create').length,
  };

  console.log('\n--- Summary ---');
  console.log(summary);

  const remaining = await conn.collection('clientagents').countDocuments({
    isPlatform: { $ne: true },
    $or: [{ agentHubId: { $in: [null, ''] } }, { syncStatus: 'failed' }],
  });
  console.log('Remaining unsynced (non-platform):', remaining);

  await conn.close();
  if (summary.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
