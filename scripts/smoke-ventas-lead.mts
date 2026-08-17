/**
 * Camino feliz Asesor de Ventas: dispara un chat con email+móvil y reporta tools + bitácora.
 * No imprime tokens, URLs ni PII.
 *
 *   npx tsx --env-file=.env scripts/smoke-ventas-lead.mts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection, Types } from 'mongoose';

const AGENT_ID = '6a80f6a6543cb99549025dd2';
const HUB_ID = 'asesor-de-ventas';
const WIDGET_ID = '6a80f6a8543cb99549025dd8';
const BASE = process.env.BASE_URL?.trim() || 'https://botiva.space';

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

function summarizeWebhooks(tools: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (!Array.isArray(tools)) return out;
  for (const t of tools as Array<{ toolId?: string; config?: Record<string, unknown> }>) {
    if (String(t?.toolId || '') !== 'webhook') continue;
    const cfg = t.config && typeof t.config === 'object' ? t.config : {};
    const arr = Array.isArray(cfg.webhooks) ? cfg.webhooks : [];
    for (const e of arr as Array<Record<string, unknown>>) {
      out.push({
        name: e?.name ?? null,
        description: typeof e?.description === 'string' ? String(e.description).slice(0, 80) : '',
        events: Array.isArray(e?.events) ? e.events : null,
        hasUrl: typeof e?.url === 'string' && String(e.url).trim().length > 0,
      });
    }
  }
  return out;
}

function tagLeadEvents(tools: unknown): { tools: unknown; tagged: number } {
  if (!Array.isArray(tools)) return { tools, tagged: 0 };
  const clone = structuredClone(tools);
  let tagged = 0;
  for (const t of clone as Array<{ toolId?: string; config?: Record<string, unknown> }>) {
    if (String(t?.toolId || '') !== 'webhook') continue;
    const cfg = t.config && typeof t.config === 'object' ? t.config : {};
    const arr = Array.isArray(cfg.webhooks) ? (cfg.webhooks as Array<Record<string, unknown>>) : [];
    for (const e of arr) {
      const desc = String(e.description || '').toLowerCase();
      const name = String(e.name || '');
      const already = Array.isArray(e.events) && e.events.map(String).includes('lead_captured');
      if (already) continue;
      if (name === 'webhook2' || /datos/.test(desc)) {
        e.events = ['lead_captured'];
        tagged += 1;
      }
    }
    t.config = { ...cfg, webhooks: arr };
  }
  return { tools: clone, tagged };
}

async function main() {
  if (!process.env.MONGODB_URI?.trim() || !HUB_MONGO) {
    throw new Error('Falta MONGODB_URI o URI del hub');
  }
  const landing = await createConnection(process.env.MONGODB_URI).asPromise();
  const hub = await createConnection(HUB_MONGO).asPromise();
  const oid = new Types.ObjectId(AGENT_ID);
  const agent = await landing.db.collection('clientagents').findOne({ _id: oid });
  const widget = await landing.db.collection('widgets').findOne({ _id: new Types.ObjectId(WIDGET_ID) });
  const hubAgent = await hub.db.collection('agents').findOne({ id: HUB_ID });
  if (!agent || !widget) throw new Error('Falta agente o widget de Ventas');

  const hubTag = tagLeadEvents(hubAgent?.tools);
  if (hubTag.tagged > 0) {
    await hub.db.collection('agents').updateOne(
      { id: HUB_ID },
      { $set: { tools: hubTag.tools, updatedAt: new Date().toISOString() } },
    );
  }

  const token = String(widget.afhubToken || widget.publicToken || '');
  if (!token) throw new Error('Widget sin token');

  const stamp = Date.now();
  const sessionId = `ventas_lead_${stamp}`;
  const message =
    `Hola, me llamo Ana Probe. Mi correo es ventas.probe.${stamp}@example.com y mi celular es 3005551234. Quiero que me contacten para una cotización.`;

  const started = Date.now();
  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: AGENT_ID,
      widgetId: WIDGET_ID,
      token,
      message,
      sessionId,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const reply = typeof json.reply === 'string' ? json.reply : '';
  const toolsUsed = Array.isArray(json.toolsUsed) ? json.toolsUsed.map(String) : [];

  const since = new Date(started - 5_000);
  const traces = await landing.db
    .collection('widgetchatlatencies')
    .find({
      createdAt: { $gte: since },
      $or: [{ agentId: AGENT_ID }, { agentHubId: HUB_ID }, { sessionId }],
    })
    .project({ createdAt: 1, ok: 1, toolsUsed: 1, path: 1, totalMs: 1, error: 1 })
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();

  const runs = await hub.db
    .collection('agent_event_runs')
    .find({ createdAt: { $gte: since }, agentId: { $in: [HUB_ID, AGENT_ID] } })
    .project({ event: 1, source: 1, ok: 1, destinations: 1, createdAt: 1, agentId: 1 })
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();

  console.log(
    JSON.stringify(
      {
        hubWebhookTagged: hubTag.tagged,
        landingWebhooks: summarizeWebhooks(agent.tools),
        hubWebhooks: summarizeWebhooks(hubTag.tagged > 0 ? hubTag.tools : hubAgent?.tools),
        hubEnabled: Array.isArray(hubAgent?.enabledToolIds) ? hubAgent.enabledToolIds : [],
        chat: {
          http: res.status,
          ms: Date.now() - started,
          ok: res.ok && !json.error,
          code: json.code ?? null,
          toolsUsed,
          capturedLead: toolsUsed.some((t) => t.includes('lead:capture') || t.includes('hubspot') || t.includes('webhook')),
          replyChars: reply.length,
          replyHead: reply.slice(0, 280),
        },
        traces: traces.map((t) => ({
          at: t.createdAt,
          ok: t.ok,
          path: t.path,
          ms: t.totalMs,
          toolsUsed: t.toolsUsed ?? [],
          error: typeof t.error === 'string' ? String(t.error).slice(0, 180) : null,
        })),
        eventRuns: runs.map((r) => ({
          at: r.createdAt,
          agentId: r.agentId,
          event: r.event,
          source: r.source,
          ok: r.ok,
          destinations: r.destinations ?? [],
        })),
      },
      null,
      2,
    ),
  );

  await landing.close();
  await hub.close();
  if (!res.ok || json.error) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
