#!/usr/bin/env node
import { createConnection } from 'mongoose';

const c = await createConnection(process.env.MONGODB_URI).asPromise();
const sessions = await c.collection('conversationsessions')
  .find({ $or: [{ sessionId: /bag4j2/i }, { chatSessionId: /bag4j2/i }] })
  .toArray();
console.log('sessions:', JSON.stringify(sessions.map((s) => ({
  sessionId: s.sessionId,
  chatSessionId: s.chatSessionId,
  userId: s.userId,
  messageCount: s.messageCount,
  widgetId: String(s.widgetId),
})), null, 2));

const ids = [...new Set(sessions.flatMap((s) => [s.sessionId, s.chatSessionId].filter(Boolean)))];
const msgs = await c.collection('widgetmessages').find({ sessionId: { $in: ids } }).toArray();
console.log('widgetmessages for ids:', msgs.length);
for (const m of msgs) {
  console.log('-', m.sessionId, m.role, (m.content || '').slice(0, 60));
}

const partial = await c.collection('widgetmessages').find({ sessionId: /bag4j2/i }).limit(20).toArray();
console.log('partial bag4j2 msgs:', partial.length);

const carlos = await c.collection('widgets').findOne({ name: /billagran/i }, { projection: { _id: 1, userId: 1 } });
if (carlos) {
  const recent = await c.collection('widgetmessages').find({ widgetId: String(carlos._id) }).sort({ createdAt: -1 }).limit(8).toArray();
  console.log('recent carlos widget msgs:', recent.map((m) => ({ sessionId: m.sessionId, role: m.role, content: (m.content || '').slice(0, 40) })));
}

await c.close();
