/**
 * Deja listo el Asesor de Ventas para captura de lead:
 * - tools HubSpot en landing + hub (si enabledToolIds está vacío, el CRM no entra al inventario)
 * - events: ['lead_captured'] en el webhook de datos
 *
 *   npx tsx --env-file=.env scripts/apply-ventas-lead-ready.mts
 *   npx tsx --env-file=.env scripts/apply-ventas-lead-ready.mts --apply
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection, Types } from 'mongoose';

const APPLY = process.argv.includes('--apply');
const AGENT_ID = '6a80f6a6543cb99549025dd2';
const HUB_ID = 'asesor-de-ventas';
const HUBSPOT_TOOL_IDS = [
  'mcp:hubspot:hubspot_search_contacts',
  'mcp:hubspot:hubspot_get_contact',
  'mcp:hubspot:hubspot_create_contact',
  'mcp:hubspot:hubspot_create_deal',
];

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

function mergeHubspot(ids: unknown): string[] {
  const cur = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
  const without = cur.filter((id) => !id.startsWith('mcp:hubspot:'));
  return [...new Set([...without, ...HUBSPOT_TOOL_IDS])];
}

async function main() {
  if (!process.env.MONGODB_URI?.trim() || !HUB_MONGO) {
    console.error('Falta MONGODB_URI o URI del hub.');
    process.exit(1);
  }
  const landing = await createConnection(process.env.MONGODB_URI).asPromise();
  const hub = await createConnection(HUB_MONGO).asPromise();
  const agents = landing.db.collection('clientagents');
  const hubAgents = hub.db.collection('agents');
  const oid = new Types.ObjectId(AGENT_ID);
  const a = await agents.findOne({ _id: oid });
  const h = await hubAgents.findOne({ id: HUB_ID });
  if (!a) throw new Error('No está el agente de ventas en landing');

  const tools = Array.isArray(a.tools) ? structuredClone(a.tools) : [];
  let webhookTagged = 0;
  for (const t of tools as Array<{ toolId?: string; config?: Record<string, unknown> }>) {
    if (String(t.toolId || '') !== 'webhook') continue;
    const cfg = t.config && typeof t.config === 'object' ? t.config : {};
    const arr = Array.isArray(cfg.webhooks) ? (cfg.webhooks as Array<Record<string, unknown>>) : [];
    for (const e of arr) {
      const desc = String(e.description || '').toLowerCase();
      const name = String(e.name || '');
      const already = Array.isArray(e.events) && e.events.map(String).includes('lead_captured');
      if (already) continue;
      if (name === 'webhook2' || /datos/.test(desc)) {
        e.events = ['lead_captured'];
        webhookTagged += 1;
      }
    }
    t.config = { ...cfg, webhooks: arr };
  }

  const landingTools = mergeHubspot(a.enabledMcpToolIds);
  const hubTools = mergeHubspot(h?.enabledToolIds);

  const report = {
    apply: APPLY,
    landingEnabledBefore: Array.isArray(a.enabledMcpToolIds) ? a.enabledMcpToolIds.length : 0,
    landingEnabledAfter: landingTools.length,
    hubEnabledBefore: Array.isArray(h?.enabledToolIds) ? h.enabledToolIds.length : 0,
    hubEnabledAfter: hubTools.length,
    webhookTagged,
    hubspotTools: HUBSPOT_TOOL_IDS,
  };

  if (!APPLY) {
    console.log(JSON.stringify({ ...report, note: 'Dry-run. Pasa --apply para escribir.' }, null, 2));
    await landing.close();
    await hub.close();
    return;
  }

  await agents.updateOne(
    { _id: oid },
    {
      $set: {
        enabledMcpToolIds: landingTools,
        tools,
        hubspotAutoCaptureContacts: true,
        updatedAt: new Date(),
      },
    },
  );
  if (h) {
    const hubToolsDoc = Array.isArray(h.tools) ? structuredClone(h.tools) : [];
    let hubWebhookTagged = 0;
    for (const t of hubToolsDoc as Array<{ toolId?: string; config?: Record<string, unknown> }>) {
      if (String(t.toolId || '') !== 'webhook') continue;
      const cfg = t.config && typeof t.config === 'object' ? t.config : {};
      const arr = Array.isArray(cfg.webhooks) ? (cfg.webhooks as Array<Record<string, unknown>>) : [];
      for (const e of arr) {
        const desc = String(e.description || '').toLowerCase();
        const name = String(e.name || '');
        const already = Array.isArray(e.events) && e.events.map(String).includes('lead_captured');
        if (already) continue;
        if (name === 'webhook2' || /datos/.test(desc)) {
          e.events = ['lead_captured'];
          hubWebhookTagged += 1;
        }
      }
      t.config = { ...cfg, webhooks: arr };
    }
    await hubAgents.updateOne(
      { id: HUB_ID },
      {
        $set: {
          enabledToolIds: hubTools,
          ...(hubWebhookTagged > 0 ? { tools: hubToolsDoc } : {}),
          updatedAt: new Date().toISOString(),
        },
      },
    );
    report.hubWebhookTagged = hubWebhookTagged;
  }
  console.log(JSON.stringify({ ...report, ok: true }, null, 2));
  await landing.close();
  await hub.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
