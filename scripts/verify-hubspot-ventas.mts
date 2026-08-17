/**
 * Prueba real: ¿HubSpot CRM responde y el Asesor de Ventas usa la tool?
 * No imprime tokens ni PII.
 *
 *   npx tsx --env-file=.env scripts/verify-hubspot-ventas.mts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection, Types } from 'mongoose';

const AGENT_ID = '6a80f6a6543cb99549025dd2';
const HUB_AGENT = 'asesor-de-ventas';
const CHAT = process.argv.includes('--chat');

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

function maskEmail(s: string): string {
  const at = s.indexOf('@');
  if (at < 1) return '…';
  return `${s.slice(0, 2)}…${s.slice(at)}`;
}

async function main() {
  const landing = await createConnection(process.env.MONGODB_URI!).asPromise();
  const widgets = landing.db.collection('widgets');
  const latency = landing.db.collection('widgetchatlatencies');
  const widget = await widgets.findOne({
    $or: [
      { agentId: AGENT_ID },
      { agentId: new Types.ObjectId(AGENT_ID) },
      { primaryAgentId: AGENT_ID },
    ],
  });

  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const traces = await latency
    .find({
      createdAt: { $gte: since },
      $or: [{ agentId: AGENT_ID }, { agentHubId: HUB_AGENT }],
    })
    .project({ createdAt: 1, ok: 1, toolsUsed: 1, path: 1, totalMs: 1, error: 1 })
    .sort({ createdAt: -1 })
    .limit(15)
    .toArray();

  const backend = (process.env.BACKEND_URL || '').replace(/\/$/, '');
  const apiKey = process.env.AIBACKHUB_API_KEY?.trim();
  const tenantId = process.env.AIBACKHUB_TENANT_ID?.trim() || 'default';

  let invoke: Record<string, unknown> = { skipped: true };
  if (backend) {
    const res = await fetch(`${backend}/api/mcp/invoke-tool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({
        agentId: HUB_AGENT,
        toolId: 'mcp:hubspot:hubspot_search_contacts',
        input: { query: 'a', limit: 1 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const data = (json.data ?? json) as Record<string, unknown>;
    const result = (data.result ?? data) as Record<string, unknown>;
    const contacts = Array.isArray(result?.contacts) ? result.contacts : [];
    invoke = {
      http: res.status,
      ok: res.ok && json.ok !== false,
      error: typeof json.error === 'string' ? json.error.slice(0, 240) : null,
      contactCount: contacts.length,
      sampleHasId: Boolean(contacts[0] && typeof contacts[0] === 'object' && (contacts[0] as { id?: string }).id),
    };
  }

  let chat: Record<string, unknown> | null = null;
  if (CHAT && widget) {
    const token = String(widget.afhubToken || widget.publicToken || '');
    const widgetId = String(widget._id);
    const base = 'https://botiva.space';
    const sessionId = `verify_hs_${Date.now()}`;
    const message =
      'Busca en HubSpot si hay un contacto con el email xyz-no-existe-botiva-probe@example.com. Dime solo si lo encontraste o no. No crees nada.';
    const res = await fetch(`${base}/api/widget/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: AGENT_ID,
        widgetId,
        token,
        message,
        sessionId,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const reply = typeof json.reply === 'string' ? json.reply : '';
    const toolsUsed = Array.isArray(json.toolsUsed) ? json.toolsUsed : [];
    chat = {
      http: res.status,
      ok: res.ok && !json.error,
      code: json.code ?? null,
      toolsUsed,
      usedHubspot: toolsUsed.some((t) => String(t).includes('hubspot')),
      replyChars: reply.length,
      replyHead: reply.slice(0, 220),
    };
  }

  console.log(
    JSON.stringify(
      {
        widget: widget
          ? { id: String(widget._id), name: widget.name, hasToken: Boolean(widget.afhubToken) }
          : null,
        invokeSearch: invoke,
        recentTurns: traces.map((t) => ({
          at: t.createdAt,
          ok: t.ok,
          path: t.path,
          ms: t.totalMs,
          toolsUsed: t.toolsUsed ?? [],
          hubspot: Array.isArray(t.toolsUsed) && t.toolsUsed.some((x: string) => String(x).includes('hubspot')),
        })),
        chat,
      },
      null,
      2,
    ),
  );

  await landing.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
