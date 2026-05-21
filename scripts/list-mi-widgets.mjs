#!/usr/bin/env node
import { createConnection } from 'mongoose';

const uri = process.env.MONGODB_URI || '';
const conn = await createConnection(uri).asPromise();
const widgets = await conn.collection('widgets').find({ name: 'Mi Widget' }).toArray();
console.log('Mi Widget count:', widgets.length);
for (const w of widgets) {
  console.log({
    id: String(w._id),
    multi: w.multiAgentEnabled,
    orchIds: w.orchestratorAgentIds,
    token: w.afhubToken?.slice(0, 14),
    agentId: w.agentId,
  });
}
await conn.close();
