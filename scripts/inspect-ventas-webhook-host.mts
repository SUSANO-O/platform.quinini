/**
 * Host del webhook de Ventas (sin path, query ni secretos) + últimos event runs.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection, Types } from 'mongoose';

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

async function main() {
  const landing = await createConnection(process.env.MONGODB_URI!).asPromise();
  const hub = await createConnection(HUB_MONGO).asPromise();
  const a = await landing.db
    .collection('clientagents')
    .findOne({ _id: new Types.ObjectId('6a80f6a6543cb99549025dd2') });
  const tools = Array.isArray(a?.tools) ? a!.tools : [];
  const hosts: unknown[] = [];
  for (const t of tools as Array<{ toolId?: string; config?: { webhooks?: Array<{ name?: string; url?: string }> } }>) {
    if (t.toolId !== 'webhook') continue;
    for (const e of t.config?.webhooks ?? []) {
      try {
        const u = new URL(String(e.url || ''));
        hosts.push({ name: e.name, host: u.host, protocol: u.protocol.replace(':', '') });
      } catch {
        hosts.push({ name: e.name, parse: false });
      }
    }
  }
  const runs = await hub.db
    .collection('agent_event_runs')
    .find({ agentId: 'asesor-de-ventas' })
    .project({ createdAt: 1, ok: 1, source: 1, destinations: 1 })
    .sort({ createdAt: -1 })
    .limit(8)
    .toArray();

  let webhookRetry: { status: number; ok: boolean } | null = null;
  if (process.argv.includes('--retry-webhook')) {
    const tools = Array.isArray(a?.tools) ? a!.tools : [];
    let url = '';
    for (const t of tools as Array<{ toolId?: string; config?: { webhooks?: Array<{ name?: string; url?: string }> } }>) {
      if (t.toolId !== 'webhook') continue;
      const hit = (t.config?.webhooks ?? []).find((e) => e.name === 'webhook2' && e.url);
      if (hit?.url) url = hit.url;
    }
    if (!url) throw new Error('webhook2 sin URL');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'MatIAs-AIBackHub-webhook/1.0' },
      body: JSON.stringify({
        event: 'lead_captured',
        source: 'retry',
        lead: { name: 'Ana Probe', email: 'ventas.retry@example.com', phone: '3005551234' },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    webhookRetry = { status: res.status, ok: res.ok };
  }
  console.log(JSON.stringify({ hosts, runs, webhookRetry }, null, 2));
  await landing.close();
  await hub.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
