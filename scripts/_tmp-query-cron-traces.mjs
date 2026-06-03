/** Consulta read-only: inferencemetrics + widgetmessages sobre cron/inversion */
import { readFileSync } from 'fs';
import { MongoClient, ObjectId } from 'mongodb';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* */
  }
}

loadEnv(join(__dirname, '../.env'));

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI missing');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db('agentflowhub_landing');

const HUB_AGENT = 'asesor-financiero';
const LANDING_AGENT = '6a1da96d094e6d2eefa7d066';
const WIDGET_IDS = ['6a1db068e3af6ba0abf1f82f', '6a1db7afefe7e1799c449793'];

console.log('=== inferencemetrics (cron tools) ===\n');

const cronMetrics = await db
  .collection('inferencemetrics')
  .find({
    $or: [
      { agentId: HUB_AGENT },
      { agentId: LANDING_AGENT },
      { widgetId: { $in: WIDGET_IDS } },
    ],
    toolsUsed: { $regex: /cron|landing:cron/i },
  })
  .sort({ createdAt: -1 })
  .limit(15)
  .toArray();

console.log('Filas con tools cron:', cronMetrics.length);
for (const m of cronMetrics) {
  console.log(
    JSON.stringify(
      {
        at: m.createdAt,
        agentId: m.agentId,
        widgetId: m.widgetId,
        path: m.path,
        toolRounds: m.toolRounds,
        toolsUsed: m.toolsUsed,
        model: m.model,
      },
      null,
      2,
    ),
  );
}

const anyCron = await db.collection('inferencemetrics').countDocuments({
  toolsUsed: { $elemMatch: { $regex: /cron/i } },
});
console.log('\nTotal inferencemetrics con alguna tool cron (global):', anyCron);

console.log('\n=== inferencemetrics recientes asesor-financiero (cualquier tool) ===\n');
const recent = await db
  .collection('inferencemetrics')
  .find({ $or: [{ agentId: HUB_AGENT }, { agentId: LANDING_AGENT }] })
  .sort({ createdAt: -1 })
  .limit(8)
  .project({ createdAt: 1, toolsUsed: 1, toolRounds: 1, path: 1, agentId: 1 })
  .toArray();
for (const m of recent) {
  console.log(m.createdAt?.toISOString?.() || m.createdAt, '|', m.path, '| rounds:', m.toolRounds, '|', m.toolsUsed?.join(', ') || '(sin tools)');
}

console.log('\n=== widgetmessages (inversion / tarea / cron) ===\n');

const msgFilter = {
  $or: [
    { widgetId: { $in: WIDGET_IDS } },
    { agentId: { $in: [HUB_AGENT, LANDING_AGENT] } },
  ],
  $or: [
    { content: { $regex: /inversi[oó]n|cron_status|cron_list|tarea programada|outputSummary|cotizaciones/i } },
  ],
};

// Fix duplicate $or - use $and
const msgs = await db
  .collection('widgetmessages')
  .find({
    $and: [
      { $or: [{ widgetId: { $in: WIDGET_IDS } }, { agentId: { $in: [HUB_AGENT, LANDING_AGENT] } }] },
      {
        content: {
          $regex: /inversi[oó]n|cron|tarea programada|outputSummary|cotizaciones|Solana|Nubank|seguridad/i,
        },
      },
    ],
  })
  .sort({ createdAt: -1 })
  .limit(20)
  .project({ role: 1, content: 1, createdAt: 1, widgetId: 1, sessionId: 1 })
  .toArray();

console.log('Mensajes coincidentes:', msgs.length);
for (const m of msgs) {
  const preview = (m.content || '').slice(0, 220).replace(/\n/g, ' ');
  console.log('\n---', m.createdAt?.toISOString?.() || m.createdAt, m.role, 'widget', m.widgetId?.slice?.(-6) || m.widgetId);
  console.log(preview);
}

console.log('\n=== Últimos 6 intercambios widget financiero ===\n');
const lastMsgs = await db
  .collection('widgetmessages')
  .find({ widgetId: WIDGET_IDS[0] })
  .sort({ createdAt: -1 })
  .limit(6)
  .toArray();
for (const m of lastMsgs.reverse()) {
  console.log(m.createdAt?.toISOString?.(), m.role + ':', (m.content || '').slice(0, 180));
}

await client.close();
