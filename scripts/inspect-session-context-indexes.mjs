/**
 * Indices y volumen de widgetsessioncontexts, para comprobar el TTL.
 *
 * Uso: node --env-file=.env scripts/inspect-session-context-indexes.mjs
 */
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const col = client.db().collection('widgetsessioncontexts');

console.log('indices:');
for (const idx of await col.indexes()) {
  const ttl =
    typeof idx.expireAfterSeconds === 'number'
      ? `  TTL=${idx.expireAfterSeconds}s (${Math.round(idx.expireAfterSeconds / 86400)}d)`
      : '';
  console.log(`  ${idx.name.padEnd(38)} ${JSON.stringify(idx.key)}${ttl}`);
}

const total = await col.countDocuments();
const viejos = await col.countDocuments({
  updatedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
});
console.log(`\nwidgetsessioncontexts: ${total} (${viejos} con mas de 7 dias sin tocar)`);

/** Las transcripciones son otra colección y hoy no caducan: solo se mide. */
const msgs = client.db().collection('widgetmessages');
const totalMsgs = await msgs.countDocuments();
const msgsViejos = await msgs.countDocuments({
  createdAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
});
const ttlMsgs = (await msgs.indexes()).some((i) => typeof i.expireAfterSeconds === 'number');
console.log(
  `widgetmessages:        ${totalMsgs} (${msgsViejos} con mas de 90 dias) — TTL: ${ttlMsgs ? 'si' : 'no'}`,
);

await client.close();
