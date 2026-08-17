/**
 * Diagnóstico del webhook2 de Asesor de Ventas (sin exponer URL completa ni secretos).
 *
 *   npx tsx --env-file=.env scripts/diagnose-ventas-webhook.mts
 *   npx tsx --env-file=.env scripts/diagnose-ventas-webhook.mts --probe
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection, Types } from 'mongoose';

const PROBE = process.argv.includes('--probe');
const AGENT_ID = '6a80f6a6543cb99549025dd2';
const HUB_ID = 'asesor-de-ventas';
const TALLER_ID = '69d5084c78e0af3d5536fe95';

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

const HUB_MONGO =
  process.env.AIBACKHUB_MONGO_URI?.trim() ||
  process.env.HUB_MONGODB_URI?.trim() ||
  process.env.MONGODB_URI?.replace(/agentflowhub_landing/i, 'agentflow') ||
  '';

type WhEntry = {
  name?: string;
  description?: string;
  url?: string;
  secret?: string;
  events?: string[];
  id?: string;
};

function extractWebhooks(tools: unknown): WhEntry[] {
  const out: WhEntry[] = [];
  if (!Array.isArray(tools)) return out;
  for (const t of tools as Array<{ toolId?: string; config?: { webhooks?: WhEntry[]; url?: string } }>) {
    if (t.toolId !== 'webhook') continue;
    const cfg = t.config ?? {};
    if (Array.isArray(cfg.webhooks)) {
      out.push(...cfg.webhooks);
    } else if (typeof cfg.url === 'string' && cfg.url.trim()) {
      out.push({ name: 'legacy', url: cfg.url, description: '' });
    }
  }
  return out;
}

function summarizeEntry(e: WhEntry) {
  let host = '';
  let pathSegments = 0;
  let looksWebhookSite = false;
  let urlOk = false;
  try {
    const u = new URL(String(e.url || ''));
    host = u.host;
    pathSegments = u.pathname.split('/').filter(Boolean).length;
    looksWebhookSite = u.host === 'webhook.site';
    urlOk = u.protocol === 'https:' && pathSegments >= 1;
  } catch {
    urlOk = false;
  }
  const events = Array.isArray(e.events) ? e.events.map(String) : [];
  const hasLeadEvent = events.includes('lead_captured') || events.includes('lead_created');
  const desc = String(e.description || '');
  const descLooksLead = /datos|contacto|lead|crm/i.test(desc);
  return {
    name: e.name ?? null,
    descriptionHead: desc.slice(0, 80),
    hasUrl: Boolean(e.url?.trim()),
    urlOk,
    host: host || null,
    pathSegments,
    looksWebhookSite,
    hasSecret: Boolean(e.secret?.trim()),
    events: events.length ? events : null,
    hasLeadEvent,
    descLooksLead,
    idPresent: Boolean(e.id),
  };
}

async function probeUrl(url: string, secret?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'MatIAs-AIBackHub-webhook/1.0',
  };
  if (secret?.trim()) {
    headers.Authorization = /^Bearer\s+/i.test(secret) ? secret : `Bearer ${secret}`;
  }
  const body = {
    event: 'lead_captured',
    source: 'diagnose',
    lead: { name: 'Diag', email: 'diag@example.com', phone: '3001112233' },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = (await res.text()).slice(0, 200);
  return {
    status: res.status,
    ok: res.ok,
    bodyHead: text.replace(/\s+/g, ' ').trim(),
  };
}

async function main() {
  const landing = await createConnection(process.env.MONGODB_URI!).asPromise();
  const hub = await createConnection(HUB_MONGO).asPromise();

  const ventasLanding = await landing.db.collection('clientagents').findOne({ _id: new Types.ObjectId(AGENT_ID) });
  const tallerLanding = await landing.db.collection('clientagents').findOne({ _id: new Types.ObjectId(TALLER_ID) });
  const ventasHub = await hub.db.collection('agents').findOne({ id: HUB_ID });

  const landingWh = extractWebhooks(ventasLanding?.tools).map(summarizeEntry);
  const hubWh = extractWebhooks(ventasHub?.tools).map(summarizeEntry);
  const tallerWh = extractWebhooks(tallerLanding?.tools).map(summarizeEntry);

  const landingRaw = extractWebhooks(ventasLanding?.tools);
  const hubRaw = extractWebhooks(ventasHub?.tools);
  const landingUrl = landingRaw.find((e) => e.name === 'webhook2')?.url ?? '';
  const hubUrl = hubRaw.find((e) => e.name === 'webhook2')?.url ?? '';
  const urlsMatch = Boolean(landingUrl && hubUrl && landingUrl === hubUrl);

  let probe: Record<string, unknown> | null = null;
  if (PROBE && landingUrl) {
    const secret = landingRaw.find((e) => e.name === 'webhook2')?.secret;
    probe = await probeUrl(landingUrl, secret);
  }

  const issues: string[] = [];
  if (landingWh.length === 0) issues.push('landing_sin_webhooks');
  if (hubWh.length === 0) issues.push('hub_sin_webhooks');
  if (!urlsMatch && landingUrl && hubUrl) issues.push('landing_hub_url_distinta');
  for (const w of landingWh) {
    if (!w.hasUrl) issues.push(`${w.name}:sin_url`);
    if (!w.urlOk) issues.push(`${w.name}:url_mal_formada_o_sin_path`);
    if (w.looksWebhookSite) issues.push(`${w.name}:destino_webhook_site_prueba_no_prod`);
    if (!w.hasLeadEvent && !w.descLooksLead) issues.push(`${w.name}:sin_evento_lead_captured`);
  }
  if (probe?.status === 429) issues.push('destino_responde_429_rate_limit_o_expirado');
  if (probe?.status === 404) issues.push('destino_responde_404_url_muerta');
  if (probe?.status === 410) issues.push('destino_responde_410_url_eliminada');

  console.log(
    JSON.stringify(
      {
        ventas: {
          landing: landingWh,
          hub: hubWh,
          landingHubUrlsMatch: urlsMatch,
        },
        tallerReference: tallerWh,
        probe,
        issues,
        verdict:
          probe?.status === 429 && landingWh.some((w) => w.looksWebhookSite)
            ? 'config_ok_destino_prueba_saturado_o_vencido'
            : issues.some((i) => i.includes('sin_url') || i.includes('mal_formada'))
              ? 'webhook_mal_configurado'
              : issues.length === 0
                ? 'config_ok'
                : 'revisar_issues',
      },
      null,
      2,
    ),
  );

  await landing.close();
  await hub.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
