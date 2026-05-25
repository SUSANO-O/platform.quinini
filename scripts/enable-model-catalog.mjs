#!/usr/bin/env node
/**
 * Habilita uno o más modelos en el catálogo Mongo del hub (`agentflow.model_catalog`).
 * Intenta primero POST /api/models/catalog/entries/:modelId/activate en AIBackHub;
 * si falla (sin BACKEND_URL o sin red), actualiza Mongo directamente.
 *
 *   node --env-file=.env scripts/enable-model-catalog.mjs
 *   MODEL_IDS=gemini-2.5-flash,vx/gemini-2.5-flash node --env-file=.env scripts/enable-model-catalog.mjs
 *   DRY_RUN=1 node --env-file=.env scripts/enable-model-catalog.mjs
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
const modelIds = (process.env.MODEL_IDS || 'gemini-2.5-flash')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const uri = process.env.MONGODB_URI || '';
const hubMongoUri =
  process.env.AIBACKHUB_MONGO_URI?.trim() ||
  process.env.HUB_MONGODB_URI?.trim() ||
  uri.replace(/agentflowhub_landing/i, 'agentflow');

const backendRaw = (process.env.BACKEND_URL || process.env.AUTH_BACKEND_URL || '').replace(/\/$/, '');
const adminKey =
  process.env.AIBACKHUB_ADMIN_KEY?.trim() ||
  process.env.ADMIN_API_KEY?.trim() ||
  process.env.AIBACKHUB_API_KEY?.trim() ||
  process.env.API_KEY?.trim() ||
  '';

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

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (process.env.AIBACKHUB_ADMIN_KEY?.trim() || process.env.ADMIN_API_KEY?.trim()) {
    h['x-admin-key'] = adminKey;
  } else if (adminKey) {
    h['x-api-key'] = adminKey;
  }
  const tenant = process.env.AIBACKHUB_TENANT_ID?.trim();
  if (tenant) h['x-tenant-id'] = tenant;
  return h;
}

async function activateViaApi(modelId) {
  const base = hubBase();
  if (!base || !adminKey) return { ok: false, reason: 'sin BACKEND_URL o clave API' };
  const url = `${base}/api/models/catalog/entries/${encodeURIComponent(modelId)}/activate`;
  if (DRY) {
    console.log(`[DRY] POST ${url}`);
    return { ok: true, dry: true };
  }
  const res = await fetch(url, { method: 'POST', headers: apiHeaders(), body: '{}' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, reason: `HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}` };
  }
  return { ok: true, via: 'api', data: json.data ?? json };
}

async function activateViaMongo(modelId) {
  if (!hubMongoUri) return { ok: false, reason: 'sin URI Mongo hub' };
  const conn = await createConnection(hubMongoUri).asPromise();
  try {
    const col = conn.db.collection('model_catalog');
    const before = await col.findOne({ modelId });
    if (!before) {
      return { ok: false, reason: `no existe modelId "${modelId}" en model_catalog` };
    }
    if (before.enabled === true && before.offerForNewAgents !== false) {
      return { ok: true, via: 'mongo', skipped: true, before };
    }
    const $set = {
      enabled: true,
      offerForNewAgents: true,
      updatedAt: new Date().toISOString(),
    };
    if (DRY) {
      console.log(`[DRY] update model_catalog ${modelId}`, $set);
      return { ok: true, dry: true, before };
    }
    await col.updateOne({ modelId }, { $set });
    const after = await col.findOne({ modelId });
    return { ok: true, via: 'mongo', before, after };
  } finally {
    await conn.close();
  }
}

console.log(`Habilitar modelos en catálogo hub: ${modelIds.join(', ')}`);
if (DRY) console.log('Modo DRY_RUN — no se aplican cambios.\n');

let failed = 0;

for (const modelId of modelIds) {
  console.log(`\n── ${modelId} ──`);
  const api = await activateViaApi(modelId);
  if (api.ok) {
    console.log('✅ API activate', api.dry ? '(dry)' : JSON.stringify(api.data ?? {}));
    continue;
  }
  console.log('⚠ API:', api.reason);
  const mongo = await activateViaMongo(modelId);
  if (mongo.ok) {
    if (mongo.skipped) {
      console.log('✅ Mongo — ya estaba habilitado');
    } else if (mongo.dry) {
      console.log('✅ Mongo (dry)', { enabled: mongo.before?.enabled });
    } else {
      console.log('✅ Mongo', {
        was: { enabled: mongo.before?.enabled, offerForNewAgents: mongo.before?.offerForNewAgents },
        now: { enabled: mongo.after?.enabled, offerForNewAgents: mongo.after?.offerForNewAgents },
      });
    }
    continue;
  }
  console.log('❌', mongo.reason);
  failed++;
}

if (failed) process.exit(1);
console.log('\nListo. Verifica con: npm run inspect:widget -- 6a03a54c4f69fa7fa9027170');
