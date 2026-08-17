/**
 * Lee forma del webhook2 sin imprimir URL completa ni secretos.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection, Types } from 'mongoose';

const AGENT_ID = '6a80f6a6543cb99549025dd2';
const HUB_ID = 'asesor-de-ventas';
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

function analyzeUrl(raw: string) {
  const s = String(raw || '').trim();
  const looksLikeEmail = /^[0-9a-f-]{36}@/.test(s) || (s.includes('@') && !s.startsWith('http'));
  const hasHttps = s.startsWith('https://');
  const hasHttp = s.startsWith('http://');
  let host: string | null = null;
  let parseOk = false;
  try {
    const u = new URL(hasHttps || hasHttp ? s : looksLikeEmail ? `https://${s}` : s);
    host = u.host;
    parseOk = true;
  } catch {
    parseOk = false;
  }
  return {
    len: s.length,
    startsHttps: hasHttps,
    startsHttp: hasHttp,
    looksLikeEmailHook: looksLikeEmail || s.includes('emailhook.site'),
    host,
    parseOk,
    preview: s.length <= 12 ? '…' : `${s.slice(0, 8)}…${s.slice(-12)}`,
  };
}

function getWebhook2(tools: unknown) {
  if (!Array.isArray(tools)) return null;
  for (const t of tools as Array<{ toolId?: string; config?: { webhooks?: Array<Record<string, unknown>> } }>) {
    if (t.toolId !== 'webhook') continue;
    const hit = (t.config?.webhooks ?? []).find((e) => e.name === 'webhook2');
    if (hit) return hit;
  }
  return null;
}

async function main() {
  const landing = await createConnection(process.env.MONGODB_URI!).asPromise();
  const hub = await createConnection(HUB_MONGO).asPromise();
  const a = await landing.db.collection('clientagents').findOne({ _id: new Types.ObjectId(AGENT_ID) });
  const h = await hub.db.collection('agents').findOne({ id: HUB_ID });
  const l = getWebhook2(a?.tools);
  const hb = getWebhook2(h?.tools);
  console.log(
    JSON.stringify(
      {
        landing: l
          ? {
              name: l.name,
              events: l.events ?? null,
              description: String(l.description || '').slice(0, 80),
              url: analyzeUrl(String(l.url || '')),
            }
          : null,
        hub: hb
          ? {
              name: hb.name,
              events: hb.events ?? null,
              url: analyzeUrl(String(hb.url || '')),
            }
          : null,
        urlsMatch: Boolean(l?.url && hb?.url && String(l.url) === String(hb.url)),
      },
      null,
      2,
    ),
  );
  await landing.close();
  await hub.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
