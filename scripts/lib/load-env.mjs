/**
 * Carga .env de landing y (opcional) AIBackHub para scripts CLI.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingRoot = resolve(__dirname, '../..');

export function loadEnvFile(path) {
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

/** Carga agent-flow-landing/.env y AIBackHub/.env si existen. */
export function loadWidgetTestEnv() {
  loadEnvFile(resolve(landingRoot, '.env'));
  loadEnvFile(resolve(landingRoot, '../AIBackHub/.env'));
}

export const PROD_WIDGET_ID = '6a03a54c4f69fa7fa9027170';
export const PROD_AGENT_ID = '69d5084c78e0af3d5536fe95';

function readLabWidget() {
  try {
    return JSON.parse(readFileSync(resolve(landingRoot, 'scripts/lab-widget.generated.json'), 'utf8'));
  } catch {
    return null;
  }
}

const labWidget = readLabWidget();
/** Tests pesados: widget lab del admin. Si aún no existe, cae al preview de producto. */
export const DEFAULT_WIDGET_ID = labWidget?.widgetId || PROD_WIDGET_ID;
export const DEFAULT_AGENT_ID = labWidget?.agentId || PROD_AGENT_ID;

export function getBaseUrl() {
  return (process.env.BASE_URL || 'http://localhost:3201').replace(/\/$/, '');
}

export function getAibackhubUrl() {
  const raw = (process.env.BACKEND_URL || process.env.AUTH_BACKEND_URL || 'http://127.0.0.1:9003').replace(/\/$/, '');
  try {
    const u = new URL(raw);
    if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
    return u.origin;
  } catch {
    return raw;
  }
}

export function aibackhubHeaders(agentName = 'widget-test') {
  const h = { 'Content-Type': 'application/json', 'x-agent-name': agentName };
  const apiKey = process.env.AIBACKHUB_API_KEY?.trim();
  if (apiKey) h['x-api-key'] = apiKey;
  const tenant = process.env.AIBACKHUB_TENANT_ID?.trim();
  if (tenant) h['x-tenant-id'] = tenant;
  return h;
}
