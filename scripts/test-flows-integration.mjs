#!/usr/bin/env node
/**
 * Integración: FlowConversation + record API + stats.
 * node --env-file=.env scripts/test-flows-integration.mjs
 */

import dns from 'dns';
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';

function configureMongoDns() {
  if (process.platform === 'win32') {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  }
}

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3201').replace(/\/$/, '');
const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  console.error('Falta MONGODB_URI');
  process.exit(1);
}

let passed = 0;
let failed = 0;
function ok(n) { console.log(`  ✓ ${n}`); passed++; }
function fail(n, e) { console.log(`  ✗ ${n} — ${e}`); failed++; }

async function main() {
  console.log('\n[Flows integration test]\n');
  configureMongoDns();
  await mongoose.connect(uri);

  const FlowSchema = new mongoose.Schema({
    userId: String,
    workspaceId: String,
    name: String,
    status: String,
    embedToken: String,
    nodes: [mongoose.Schema.Types.Mixed],
    connections: [mongoose.Schema.Types.Mixed],
  }, { timestamps: true });

  const ConvSchema = new mongoose.Schema({
    flowId: String,
    userId: String,
    sessionId: { type: String, unique: true },
    status: String,
    startedAt: Date,
    endedAt: Date,
    durationSec: Number,
    messageCount: Number,
    month: String,
  }, { timestamps: true });

  const Flow = mongoose.models.ConversationFlow || mongoose.model('ConversationFlow', FlowSchema);
  const Conv = mongoose.models.FlowConversation || mongoose.model('FlowConversation', ConvSchema);

  const userId = `integ_${Date.now()}`;
  const embedToken = `ft_${randomBytes(12).toString('hex')}`;

  let flowId;
  try {
    const doc = await Flow.create({
      userId,
      workspaceId: `personal:${userId}`,
      name: 'Integration flow',
      status: 'published',
      embedToken,
      nodes: [{ id: 'start', type: 'start', x: 0, y: 0 }],
      connections: [],
    });
    flowId = doc._id.toString();
    ok(`Crear flujo publicado (${flowId})`);
  } catch (e) {
    fail('Crear flujo', e.message);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Record sin token → 401
  try {
    const res = await fetch(`${BASE_URL}/api/flows/${flowId}/conversations/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    if (res.status === 401) ok('POST record sin token → 401');
    else fail('POST record sin token', `status ${res.status}`);
  } catch (e) {
    fail('POST record sin token', e.message);
  }

  let sessionId;
  try {
    const res = await fetch(`${BASE_URL}/api/flows/${flowId}/conversations/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-flow-token': embedToken },
      body: JSON.stringify({ status: 'active', messageCount: 2, visitorId: 'vis_test' }),
    });
    const data = await res.json();
    if (res.status === 201 && data.sessionId) {
      sessionId = data.sessionId;
      ok(`POST record start → 201 (${sessionId})`);
    } else {
      fail('POST record start', `${res.status} ${JSON.stringify(data)}`);
    }
  } catch (e) {
    fail('POST record start', e.message);
  }

  if (sessionId) {
    try {
      const res = await fetch(`${BASE_URL}/api/flows/${flowId}/conversations/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-flow-token': embedToken },
        body: JSON.stringify({
          sessionId,
          status: 'completed',
          messageCount: 5,
        }),
      });
      if (res.ok) ok('POST record complete → 200');
      else fail('POST record complete', `status ${res.status}`);
    } catch (e) {
      fail('POST record complete', e.message);
    }
  }

  try {
    const conv = await Conv.findOne({ sessionId }).lean();
    if (conv?.status === 'completed' && conv.messageCount === 5) {
      ok('Mongo: conversación completada persistida');
    } else {
      fail('Mongo conversación', JSON.stringify(conv));
    }
  } catch (e) {
    fail('Mongo conversación', e.message);
  }

  // Draft flow → 403
  try {
    await Flow.updateOne({ _id: flowId }, { $set: { status: 'draft' } });
    const res = await fetch(`${BASE_URL}/api/flows/${flowId}/conversations/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-flow-token': embedToken },
      body: JSON.stringify({ status: 'active' }),
    });
    if (res.status === 403) ok('POST record flujo borrador → 403');
    else fail('POST record borrador', `status ${res.status}`);
    await Flow.updateOne({ _id: flowId }, { $set: { status: 'published' } });
  } catch (e) {
    fail('POST record borrador', e.message);
  }

  // Cleanup + cascade delete
  try {
    await Flow.deleteOne({ _id: flowId });
    await Conv.deleteMany({ flowId });
    const left = await Conv.countDocuments({ flowId });
    if (left === 0) ok('Cleanup OK');
    else fail('Cleanup', `${left} conversaciones restantes`);
  } catch (e) {
    fail('Cleanup', e.message);
  }

  await mongoose.disconnect();
  console.log(`\nResultado: ${passed} ok, ${failed} fallos\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
