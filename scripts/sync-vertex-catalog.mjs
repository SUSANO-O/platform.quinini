#!/usr/bin/env node
/**
 * Sincroniza modelos Vertex en Mongo (AIBackHub) desde la API Gemini.
 * Equivalente a POST /api/models/catalog/sync-vertex en el Hub.
 *
 * Uso:
 *   node scripts/sync-vertex-catalog.mjs
 *   node scripts/sync-vertex-catalog.mjs --backend http://127.0.0.1:9003
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
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

const backendArg = process.argv.find((a) => a.startsWith('--backend='));
const backend = (backendArg ? backendArg.split('=')[1] : process.env.BACKEND_URL || 'http://127.0.0.1:9003').replace(/\/$/, '');
const adminKey = process.env.AIBACKHUB_ADMIN_KEY?.trim() || process.env.ADMIN_API_KEY?.trim() || process.env.AIBACKHUB_API_KEY?.trim() || process.env.API_KEY?.trim() || '';

if (!adminKey) {
  console.error('Falta AIBACKHUB_ADMIN_KEY, AIBACKHUB_API_KEY o ADMIN_API_KEY en .env');
  process.exit(1);
}

const url = `${backend}/api/models/catalog/sync-vertex`;
console.log(`POST ${url}`);

const headers = { 'Content-Type': 'application/json' };
if (process.env.AIBACKHUB_ADMIN_KEY?.trim() || process.env.ADMIN_API_KEY?.trim()) {
  headers['x-admin-key'] = adminKey;
} else {
  headers['x-api-key'] = adminKey;
}

const res = await fetch(url, { method: 'POST', headers, body: '{}' });
const json = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error('Error HTTP', res.status, JSON.stringify(json, null, 2));
  process.exit(1);
}

const data = json.data ?? json;
console.log('OK:', JSON.stringify(data, null, 2));
console.log('\nRecarga el selector de modelos en el dashboard.');
