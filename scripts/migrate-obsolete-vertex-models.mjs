#!/usr/bin/env node
/**
 * Actualiza en Mongo agentes con modelos Vertex obsoletos → modelos activos en la API Gemini.
 * También re-sync al catálogo AIBackHub (PUT /api/agents/:id) si hay agentHubId + BACKEND_URL.
 *
 *   node --env-file=.env scripts/migrate-obsolete-vertex-models.mjs
 *   DRY_RUN=1 node --env-file=.env scripts/migrate-obsolete-vertex-models.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvFile(path) {
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
      if (process.env[key] == null || process.env[key] === '') process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(resolve(root, '.env'));
loadEnvFile(resolve(root, '../AIBackHub/.env'));

const DRY = process.env.DRY_RUN === '1';
const uri = process.env.MONGODB_URI || '';
const hubMongoUri =
  process.env.AIBACKHUB_MONGO_URI?.trim() ||
  process.env.HUB_MONGODB_URI?.trim() ||
  readEnvFromSibling('MONGODB_URI') ||
  uri.replace(/agentflowhub_landing/i, 'agentflow');
const backendRaw = (process.env.BACKEND_URL || process.env.AUTH_BACKEND_URL || '').replace(/\/$/, '');
const apiKey = process.env.AIBACKHUB_API_KEY?.trim() || '';
const vertexKey =
  process.env.VERTEX_GEMINI_API_KEY?.trim() ||
  readEnvFromSibling('VERTEX_GEMINI_API_KEY') ||
  '';

function readEnvFromSibling(key) {
  try {
    const m = readFileSync(resolve(root, '../AIBackHub/.env'), 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

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

async function fetchActiveVertexApiIds() {
  if (!vertexKey) throw new Error('Falta VERTEX_GEMINI_API_KEY (landing o AIBackHub/.env)');
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(vertexKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || `Gemini list models HTTP ${res.status}`);
  }
  return new Set(
    (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter(Boolean),
  );
}

/** ID de API sin prefijo vx/ */
function apiIdFromStored(model) {
  const m = String(model || '').trim();
  if (!m) return '';
  return m.startsWith('vx/') ? m.slice(3) : m;
}

function withStoredPrefix(apiId, storedModel) {
  const s = String(storedModel || '').trim();
  return s.startsWith('vx/') ? `vx/${apiId}` : apiId;
}

const ALIAS_MAP = {
  'gemini-1.1-pro-preview': 'gemini-3.1-pro-preview',
  'gemini-1.5-pro-preview': 'gemini-2.5-pro',
  'gemini-1.5-flash-preview': 'gemini-2.5-flash',
  'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite',
  'gemini-3.0-pro-preview': 'gemini-3-pro-preview',
};

/** Modelos que la API lista pero fallan en generateContent (retirados o preview muerto). */
const KNOWN_BROKEN_API_IDS = new Set([
  'gemini-3.1-flash-lite-preview',
  'gemini-1.1-pro-preview',
  'gemini-1.5-pro-preview',
  'gemini-1.5-flash-preview',
]);

function needsMigration(storedModel, active) {
  if (!isMigratableModel(storedModel)) return false;
  const api = apiIdFromStored(storedModel);
  if (!api) return false;
  if (KNOWN_BROKEN_API_IDS.has(api)) return true;
  return !active.has(api);
}

function pickReplacement(storedModel, active) {
  const oldApi = apiIdFromStored(storedModel);
  if (!oldApi) return null;
  if (!needsMigration(storedModel, active)) return null;

  const alias = ALIAS_MAP[oldApi];
  if (alias && active.has(alias)) return withStoredPrefix(alias, storedModel);

  const l = oldApi.toLowerCase();
  const candidates = [];
  if (l.includes('pro')) {
    candidates.push('gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-pro-latest', 'gemini-3-pro-preview');
  } else if (l.includes('flash-lite') || (l.includes('lite') && l.includes('flash'))) {
    candidates.push('gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest');
  } else if (l.includes('flash')) {
    candidates.push('gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-3.5-flash');
  } else if (l.startsWith('gemma')) {
    candidates.push('gemma-4-31b-it', 'gemma-4-26b-a4b-it');
  }
  candidates.push('gemini-2.5-flash');

  for (const c of candidates) {
    if (active.has(c)) return withStoredPrefix(c, storedModel);
  }
  return withStoredPrefix('gemini-2.5-flash', storedModel);
}

function isMigratableModel(storedModel) {
  const m = String(storedModel || '').trim();
  if (!m || m.startsWith('hf/') || m.startsWith('claude-') || m.startsWith('gpt-') || m.startsWith('deepseek-')) {
    return false;
  }
  if (m.startsWith('vx/')) return true;
  return /^(gemini-|gemma-|nano-banana|deep-research|lyria-|antigravity|gemini-robotics)/i.test(m);
}

function migrateFallbacks(fallbacks, active) {
  if (!Array.isArray(fallbacks) || !fallbacks.length) return { changed: false, value: fallbacks };
  let changed = false;
  const out = [];
  const seen = new Set();
  for (const raw of fallbacks) {
    const stored = String(raw || '').trim();
    if (!stored) continue;
    let next = stored;
    if (isMigratableModel(stored)) {
      const rep = needsMigration(stored, active) ? pickReplacement(stored, active) : null;
      if (rep) {
        next = rep;
        changed = true;
      }
    }
    const api = apiIdFromStored(next);
    if (isMigratableModel(next) && !active.has(api)) continue;
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  if (out.length !== fallbacks.length) changed = true;
  return { changed, value: out };
}

async function pushAgentToHub(base, agent, newModel, newFallbacks) {
  const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
  if (!hubId) return { synced: false, reason: 'no agentHubId' };

  const payload = {
    name: agent.name,
    description: (agent.description || '').trim(),
    prompt: agent.systemPrompt,
    model: newModel,
    ragEnabled: Boolean(agent.ragEnabled),
    ragSources: Array.isArray(agent.ragSources) ? agent.ragSources : [],
    catalogAgentType: agent.type === 'sub-agent' ? 'sub-agent' : 'agent',
    strictPurposeOnly: agent.strictPurposeOnly !== false,
    landingClientAgentId: String(agent._id),
  };
  if (Array.isArray(newFallbacks) && newFallbacks.length) payload.fallbackModels = newFallbacks;

  const res = await fetch(`${base}/api/agents/${encodeURIComponent(hubId)}`, {
    method: 'PUT',
    headers: hubHeaders(),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  return { synced: res.ok, status: res.status, hubId };
}

async function main() {
  if (!uri) throw new Error('Falta MONGODB_URI');

  console.log('Consultando modelos activos en API Gemini…');
  const active = await fetchActiveVertexApiIds();
  console.log(`  ${active.size} modelos con generateContent\n`);

  const landingConn = await createConnection(uri).asPromise();
  const landingCol = landingConn.db.collection('clientagents');
  let hubConn = null;
  let hubCol = null;
  if (hubMongoUri) {
    try {
      hubConn = await createConnection(hubMongoUri).asPromise();
      hubCol = hubConn.db.collection('agents');
    } catch (e) {
      console.warn('No se pudo conectar al Mongo del hub:', e instanceof Error ? e.message : e);
    }
  }

  const agents = await landingCol
    .find(
      { status: { $ne: 'disabled' } },
      {
        projection: {
          name: 1,
          model: 1,
          fallbackModels: 1,
          agentHubId: 1,
          systemPrompt: 1,
          description: 1,
          ragEnabled: 1,
          ragSources: 1,
          type: 1,
          strictPurposeOnly: 1,
        },
      },
    )
    .toArray();

  const base = hubBase();
  const updates = [];

  for (const agent of agents) {
    const oldModel = String(agent.model || '').trim();
    const newModel = needsMigration(oldModel, active) ? pickReplacement(oldModel, active) : null;
    const fb = migrateFallbacks(agent.fallbackModels, active);
    if (!newModel && !fb.changed) continue;

    const nextModel = newModel || oldModel;
    const nextFallbacks = fb.changed ? fb.value : agent.fallbackModels;

    updates.push({
      _id: agent._id,
      name: agent.name,
      agentHubId: agent.agentHubId,
      oldModel,
      newModel: nextModel,
      fallbackModels: nextFallbacks,
      agent,
    });
  }

  if (!updates.length) {
    console.log('Ningún agente en landing requiere migración de modelo.');
  } else {
    console.log(`Agentes landing a actualizar: ${updates.length}\n`);
    for (const u of updates) {
      console.log(`  • ${u.name} (${u._id})`);
      console.log(`    ${u.oldModel}  →  ${u.newModel}`);
      if (u.fallbackModels?.length) console.log(`    fallbacks: ${u.fallbackModels.join(', ')}`);
    }
    console.log('');
  }

  // Hub agents con modelos obsoletos (puede diferir de landing)
  const hubUpdates = [];
  if (hubCol) {
    const hubAgents = await hubCol
      .find({}, { projection: { id: 1, name: 1, model: 1, fallbackModels: 1, landingClientAgentId: 1 } })
      .toArray();
    for (const agent of hubAgents) {
      const oldModel = String(agent.model || '').trim();
      const newModel = needsMigration(oldModel, active) ? pickReplacement(oldModel, active) : null;
      const fb = migrateFallbacks(agent.fallbackModels, active);
      if (!newModel && !fb.changed) continue;
      hubUpdates.push({
        id: agent.id,
        name: agent.name,
        oldModel,
        newModel: newModel || oldModel,
        fallbackModels: fb.changed ? fb.value : agent.fallbackModels,
      });
    }
    if (hubUpdates.length) {
      console.log(`Agentes hub (Mongo agentflow) a actualizar: ${hubUpdates.length}`);
      for (const u of hubUpdates) {
        console.log(`  • ${u.name} (${u.id})  ${u.oldModel} → ${u.newModel}`);
      }
      console.log('');
    }
  }

  if (!updates.length && !hubUpdates.length) {
    await landingConn.close();
    if (hubConn) await hubConn.close();
    return;
  }

  if (!updates.length && hubUpdates.length) {
    /* solo hub abajo */
  } else if (updates.length && !hubUpdates.length && !hubCol) {
    /* solo landing */
  }

  if (DRY) {
    console.log('DRY_RUN=1 — no se escribió nada.');
    await landingConn.close();
    if (hubConn) await hubConn.close();
    return;
  }

  let mongoOk = 0;
  let hubMongoOk = 0;
  let hubApiOk = 0;
  for (const u of updates) {
    const $set = { model: u.newModel };
    if (u.fallbackModels) $set.fallbackModels = u.fallbackModels;
    await landingCol.updateOne({ _id: u._id }, { $set });
    mongoOk++;

    if (base) {
      try {
        const r = await pushAgentToHub(base, u.agent, u.newModel, u.fallbackModels);
        if (r.synced) hubApiOk++;
        else console.warn(`    hub API falló (${u.agentHubId || '—'}): HTTP ${r.status ?? '—'}`);
      } catch (e) {
        console.warn(`    hub API error (${u.agentHubId || '—'}): ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  if (hubCol && hubUpdates.length) {
    for (const u of hubUpdates) {
      const $set = { model: u.newModel, lastModified: new Date().toISOString() };
      if (u.fallbackModels) $set.fallbackModels = u.fallbackModels;
      await hubCol.updateOne({ id: u.id }, { $set });
      hubMongoOk++;
    }
  }

  console.log(`Landing Mongo: ${mongoOk} agente(s) actualizados.`);
  if (hubCol) console.log(`Hub Mongo:     ${hubMongoOk} agente(s) actualizados (agentflow.agents).`);
  if (base) console.log(`Hub API:       ${hubApiOk}/${updates.length} sincronizados (PUT).`);
  else if (updates.length) console.log('Hub API:       omitido (sin BACKEND_URL / AIBackHub apagado).');

  await landingConn.close();
  if (hubConn) await hubConn.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
