#!/usr/bin/env node
/**
 * Auditoría de fases MCP (A–E) + pruebas HTTP al AIBackHub cuando BACKEND_URL está en .env
 *
 * Uso (desde la carpeta agent-flow-landing):
 *   node scripts/verify-mcp-phases.mjs
 *
 * Variables (archivo .env o entorno):
 *   BACKEND_URL          — base del hub, ej. http://127.0.0.1:9003
 *   AIBACKHUB_API_KEY    — si el hub tiene API_KEY, misma cabecera x-api-key
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadDotEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadDotEnv();

const BACKEND = (process.env.BACKEND_URL || '').replace(/\/$/, '');
const API_KEY = (process.env.AIBACKHUB_API_KEY || '').trim();

function hubHeaders(json = true) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  if (API_KEY) h['x-api-key'] = API_KEY;
  return h;
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...hubHeaders(!!opts.body), ...opts.headers } });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text };
  }
  return { ok: r.ok, status: r.status, data };
}

console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log('  MCP — auditoría de fases (código) + pruebas hub (red)');
console.log('══════════════════════════════════════════════════════════════\n');

// ── Fase A: UI dos pasos + Avanzado mcp_standard ───────────────────────────
const formPath = path.join(root, 'src', 'components', 'mcp', 'mcp-landing-connect-form.tsx');
let phaseA = { ok: false, detail: '' };
if (fs.existsSync(formPath)) {
  const src = fs.readFileSync(formPath, 'utf8');
  const hasSteps =
    /step\s*===\s*1/.test(src) &&
    (/step\s*===\s*2/.test(src) || /useState\s*<\s*1\s*\|\s*2\s*>/.test(src));
  const hasAdvanced = src.includes('mcp_standard') && src.includes('Avanzado');
  const hasCards = src.includes('selectIntegration') && src.includes('goBackToPicker');
  phaseA = {
    ok: hasSteps && hasAdvanced && hasCards,
    detail: hasSteps ? 'step 1/2 + cards' : 'falta flujo por pasos',
  };
} else {
  phaseA.detail = 'no se encuentra mcp-landing-connect-form.tsx';
}
console.log('[A] Catálogo como paso 1 (cards → credenciales), MCP estándar en Avanzado');
console.log(`    Estado: ${phaseA.ok ? 'OK (implementado)' : 'REVISAR'} — ${phaseA.detail}\n`);

// ── Fase B: preview-standard (landing proxy + hub) ─────────────────────────
const previewLanding = fs.existsSync(path.join(root, 'src', 'app', 'api', 'mcp', 'preview-standard', 'route.ts'));
console.log('[B] Vista previa MCP estándar (preview) antes de guardar');
console.log(`    Landing POST /api/mcp/preview-standard: ${previewLanding ? 'OK (ruta existe)' : 'NO IMPLEMENTADO'}`);
console.log('    UI "Probar conexión" en el formulario: revisar manualmente (puede faltar)\n');

// ── Fase C: OAuth ────────────────────────────────────────────────────────────
const grepOAuth = (() => {
  try {
    const dir = path.join(root, 'src', 'components', 'mcp');
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.tsx') && !f.endsWith('.ts')) continue;
      const c = fs.readFileSync(path.join(dir, f), 'utf8');
      if (/oauth|Conectar con Google/i.test(c)) return true;
    }
  } catch {}
  return false;
})();
console.log('[C] OAuth / Conectar con Google·GitHub en flujo MCP');
console.log(`    Estado: ${grepOAuth ? 'parcial o presente' : 'NO implementado en components/mcp'}\n`);

// ── Fase D: Registry dinámico por plan ───────────────────────────────────────
const registryHint = fs.readFileSync(formPath, 'utf8').includes('GET /api/mcp/catalog');
console.log('[D] Registry dinámico por tenant/plan');
console.log(`    Estado: ${registryHint ? 'catálogo vía hub (sin filtro plan en front)' : 'N/A'} — NO hay endpoint registry dedicado\n`);

// ── Fase E: Pulido UX ────────────────────────────────────────────────────────
console.log('[E] Textos, errores, accesibilidad');
console.log('    Estado: parcial (mensajes err/ok en formulario; sin auditoría a11y automática)\n');

// ── Pruebas red al hub ───────────────────────────────────────────────────────
console.log('──────────────────────────────────────────────────────────────');
console.log('  Pruebas HTTP → AIBackHub (requiere hub en marcha si quieres OK real)');
console.log('──────────────────────────────────────────────────────────────\n');

if (!BACKEND) {
  console.log('  SKIP: BACKEND_URL vacío. Añade BACKEND_URL en .env para probar el hub.\n');
  console.log('  Ejemplos curl manuales (hub sin API_KEY en dev):\n');
  console.log('    curl -sS "' + (BACKEND || 'http://127.0.0.1:9003') + '/api/mcp/catalog"\n');
  process.exit(0);
}

console.log(`  BACKEND_URL=${BACKEND}`);
console.log(`  x-api-key: ${API_KEY ? '(definida)' : '(vacía — el hub debe tener API_KEY desactivado o rutas públicas)'}\n`);

let exitCode = 0;

// GET /api/mcp/catalog — público en hub sin API_KEY (authMiddleware)
const catUrl = `${BACKEND}/api/mcp/catalog`;
console.log(`  GET  ${catUrl}`);
try {
  const r = await fetchJson(catUrl, { method: 'GET', headers: { ...hubHeaders(false) } });
  if (r.status === 200 && (r.data?.data?.catalog || r.data?.catalog)) {
    const list = r.data?.data?.catalog ?? r.data?.catalog ?? [];
    console.log(`       → ${r.status} OK (${Array.isArray(list) ? list.length : '?'} integraciones)\n`);
  } else {
    console.log(`       → ${r.status}`, JSON.stringify(r.data).slice(0, 200));
    if (r.status === 401 || r.status === 403) {
      console.log('       Hint: define AIBACKHUB_API_KEY en .env igual que API_KEY del hub.\n');
    }
    exitCode = 1;
  }
} catch (e) {
  console.log(`       → ERROR ${e.message} (¿hub arrancado?)\n`);
  exitCode = 1;
}

// POST preview-standard — requiere x-api-key si el hub tiene API_KEY
const prevUrl = `${BACKEND}/api/mcp/preview-standard`;
console.log(`  POST ${prevUrl}  (body: URL inválida → error de validación esperado)`);
try {
  const r = await fetchJson(prevUrl, {
    method: 'POST',
    body: JSON.stringify({ serverUrl: 'not-a-valid-url' }),
  });
  if (r.status === 200 || r.status === 400) {
    console.log(`       → ${r.status} (respuesta coherente)\n`);
  } else {
    console.log(`       → ${r.status}`, JSON.stringify(r.data).slice(0, 300), '\n');
    if (r.status === 401) console.log('       Hint: AIBACKHUB_API_KEY debe coincidir con API_KEY del hub.\n');
    exitCode = 1;
  }
} catch (e) {
  console.log(`       → ERROR ${e.message}\n`);
  exitCode = 1;
}

console.log('══════════════════════════════════════════════════════════════');
console.log('  Ejemplos curl (PowerShell / bash)');
console.log('══════════════════════════════════════════════════════════════\n');
console.log(`  # Catálogo (suele ser público)`);
console.log(`  curl -sS "${BACKEND}/api/mcp/catalog"\n`);
console.log(`  # Preview (si hub exige API_KEY)`);
console.log(`  curl -sS -X POST "${BACKEND}/api/mcp/preview-standard" \\`);
if (API_KEY) {
  console.log(`    -H "x-api-key: <valor de AIBACKHUB_API_KEY en .env>" \\`);
}
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d "{\\"serverUrl\\":\\"http://127.0.0.1:9999/mcp\\"}"\n`);
console.log(`  # Landing (sesión cookie): abre sesión en el navegador y usa DevTools, o:`);
console.log(`  # POST ${process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3201'}/api/mcp/preview-standard`);
console.log(`  #   Cookie: session=...  Body igual que al hub.\n`);

process.exit(exitCode);
