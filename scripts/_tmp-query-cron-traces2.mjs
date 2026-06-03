import { readFileSync } from 'fs';
import { MongoClient } from 'mongodb';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '../.env'), 'utf8');
const uri = env.match(/^MONGODB_URI=(.+)$/m)?.[1]?.trim();
const client = new MongoClient(uri);
await client.connect();
const db = client.db('agentflowhub_landing');

const cols = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => /infer|metric|widget|message/i.test(n));
console.log('Collections:', cols);

for (const name of ['inferencemetrics', 'inference_metrics', 'widgetmessages']) {
  try {
    const n = await db.collection(name).countDocuments();
    console.log(name, 'count:', n);
  } catch (e) {
    console.log(name, 'err');
  }
}

const samples = await db.collection('inferencemetrics').find({}).sort({ createdAt: -1 }).limit(3).toArray();
console.log('\nSample inferencemetrics:', JSON.stringify(samples, null, 2));

const allWidgets = await db
  .collection('widgetmessages')
  .find({ content: { $regex: /inversi|programad|cron|Solana|seguridad|outputSummary/i } })
  .sort({ createdAt: -1 })
  .limit(15)
  .project({ content: 1, role: 1, createdAt: 1, agentId: 1, widgetId: 1 })
  .toArray();
console.log('\nGlobal widgetmessages match:', allWidgets.length);
for (const m of allWidgets) {
  console.log('---', m.createdAt, m.agentId, m.role, (m.content || '').slice(0, 150));
}

await client.close();
