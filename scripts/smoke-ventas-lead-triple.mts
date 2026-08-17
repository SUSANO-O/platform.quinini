/**
 * Tres visitantes en paralelo: quieren comprar y dejan datos (flujo natural widget).
 * No imprime tokens, URLs ni PII completa.
 *
 *   npx tsx --env-file=.env scripts/smoke-ventas-lead-triple.mts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection, Types } from 'mongoose';

const AGENT_ID = '6a80f6a6543cb99549025dd2';
const HUB_ID = 'asesor-de-ventas';
const WIDGET_ID = '6a80f6a8543cb99549025dd8';
const BASE = process.env.BASE_URL?.trim() || 'https://botiva.space';

const CLIENTS = [
  {
    label: 'cliente_1',
    name: 'Carlos Méndez',
    emailSuffix: 'carlos',
    phone: '3001112233',
    message:
      'Buenas, quiero comprar ya. Me llamo Carlos Méndez, mi correo es ventas.triple.carlos.{stamp}@example.com y mi celular 3001112233. ¿Me pueden cotizar?',
  },
  {
    label: 'cliente_2',
    name: 'Laura Vega',
    emailSuffix: 'laura',
    phone: '3012223344',
    message:
      'Hola, estoy lista para comprar. Soy Laura Vega, escríbanme a ventas.triple.laura.{stamp}@example.com o al 3012223344. Necesito cotización.',
  },
  {
    label: 'cliente_3',
    name: 'Diego Ríos',
    emailSuffix: 'diego',
    phone: '3023334455',
    message:
      'Quiero cerrar la compra hoy. Diego Ríos, email ventas.triple.diego.{stamp}@example.com, móvil 3023334455. Dejen mis datos para que me llamen.',
  },
] as const;

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

type ChatOutcome = {
  label: string;
  sessionId: string;
  http: number;
  ms: number;
  ok: boolean;
  toolsUsed: string[];
  capturedLead: boolean;
  replyChars: number;
  error: string | null;
};

async function chatAsClient(
  token: string,
  stamp: number,
  client: (typeof CLIENTS)[number],
): Promise<ChatOutcome> {
  const sessionId = `ventas_triple_${client.label}_${stamp}`;
  const message = client.message.replaceAll('{stamp}', String(stamp));
  const t0 = Date.now();
  try {
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
    return {
      label: client.label,
      sessionId,
      http: res.status,
      ms: Date.now() - t0,
      ok: res.ok && !json.error && reply.length > 10,
      toolsUsed,
      capturedLead: toolsUsed.some(
        (t) => t.includes('lead:capture') || t.includes('hubspot') || t.includes('webhook'),
      ),
      replyChars: reply.length,
      error: typeof json.error === 'string' ? json.error.slice(0, 160) : null,
    };
  } catch (e) {
    return {
      label: client.label,
      sessionId,
      http: 0,
      ms: Date.now() - t0,
      ok: false,
      toolsUsed: [],
      capturedLead: false,
      replyChars: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  if (!process.env.MONGODB_URI?.trim() || !HUB_MONGO) {
    throw new Error('Falta MONGODB_URI o URI del hub');
  }
  const landing = await createConnection(process.env.MONGODB_URI).asPromise();
  const hub = await createConnection(HUB_MONGO).asPromise();
  const widget = await landing.db.collection('widgets').findOne({ _id: new Types.ObjectId(WIDGET_ID) });
  if (!widget) throw new Error('Widget no encontrado');

  const token = String(widget.afhubToken || widget.publicToken || '');
  if (!token) throw new Error('Widget sin token');

  const stamp = Date.now();
  const started = Date.now();
  const results = await Promise.all(CLIENTS.map((c) => chatAsClient(token, stamp, c)));

  const since = new Date(started - 3_000);
  const runs = await hub.db
    .collection('agent_event_runs')
    .find({ createdAt: { $gte: since }, agentId: HUB_ID, event: 'lead_captured' })
    .project({ ok: 1, source: 1, destinations: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  const okChats = results.filter((r) => r.ok).length;
  const okCaptures = results.filter((r) => r.capturedLead).length;
  const okEventRuns = runs.filter((r) => r.ok === true).length;

  console.log(
    JSON.stringify(
      {
        parallel: 3,
        totalMs: Date.now() - started,
        summary: {
          chatsOk: okChats,
          capturesReported: okCaptures,
          eventRunsOk: okEventRuns,
          allGreen: okChats === 3 && okCaptures === 3 && okEventRuns >= 3,
        },
        clients: results.map((r) => ({
          label: r.label,
          ok: r.ok,
          http: r.http,
          ms: r.ms,
          capturedLead: r.capturedLead,
          toolsUsed: r.toolsUsed,
          replyChars: r.replyChars,
          error: r.error,
        })),
        eventRuns: runs.slice(0, 6).map((r) => ({
          at: r.createdAt,
          ok: r.ok,
          source: r.source,
          destinations: (r.destinations ?? []).map((d: { kind?: string; ok?: boolean; error?: string }) => ({
            kind: d.kind,
            ok: d.ok,
            error: d.error ?? null,
          })),
        })),
      },
      null,
      2,
    ),
  );

  await landing.close();
  await hub.close();
  if (okChats !== 3 || okCaptures !== 3) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
