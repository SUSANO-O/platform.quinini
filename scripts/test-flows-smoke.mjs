#!/usr/bin/env node
/**
 * Smoke test: CRUD de ConversationFlow en MongoDB + rutas HTTP básicas.
 *
 * Uso:
 *   node --env-file=.env scripts/test-flows-smoke.mjs
 */

import dns from 'dns';
import mongoose from 'mongoose';

function configureMongoDns() {
  const custom = process.env.MONGODB_DNS_SERVERS?.trim();
  if (custom) {
    dns.setServers(custom.split(',').map((s) => s.trim()).filter(Boolean));
    return;
  }
  if (process.platform === 'win32') {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  }
}

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3201').replace(/\/$/, '');
const uri = process.env.MONGODB_URI?.trim();

if (!uri) {
  console.error('Falta MONGODB_URI en .env');
  process.exit(1);
}

const StartNode = {
  id: 'start',
  type: 'start',
  x: 100,
  y: 100,
  question: 'El flujo comienza aquí',
};

let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`  ✓ ${name}`);
  passed++;
}

function fail(name, err) {
  console.log(`  ✗ ${name} — ${err}`);
  failed++;
}

async function main() {
  console.log('\n[Flows smoke test]\n');

  // HTTP sin sesión → 401
  try {
    const res = await fetch(`${BASE_URL}/api/flows`);
    if (res.status === 401) ok('GET /api/flows sin auth → 401');
    else fail('GET /api/flows sin auth → 401', `status ${res.status}`);
  } catch (e) {
    fail('GET /api/flows sin auth', e.message);
  }

  await configureMongoDns();
  await mongoose.connect(uri);

  const Flow =
    mongoose.models.ConversationFlow
    || mongoose.model('ConversationFlow', new mongoose.Schema({
      userId: String,
      orgId: { type: String, default: null },
      workspaceId: String,
      name: { type: String, default: 'Flujo sin título' },
      status: { type: String, default: 'draft' },
      description: String,
      tags: String,
      generatesLeads: Boolean,
      enabledChannels: [String],
      completionMessage: String,
      tooltipEnabled: Boolean,
      tooltipMessage: String,
      tooltipDelay: Number,
      tooltipDuration: Number,
      nodes: [mongoose.Schema.Types.Mixed],
      connections: [mongoose.Schema.Types.Mixed],
    }, { timestamps: true }));

  const testUserId = `smoke_flow_${Date.now()}`;
  const workspaceId = `personal:${testUserId}`;

  let flowId;
  try {
    const created = await Flow.create({
      userId: testUserId,
      workspaceId,
      name: 'Smoke test flow',
      nodes: [StartNode],
      connections: [],
      enabledChannels: ['widget'],
    });
    flowId = created._id.toString();
    ok(`Mongo CREATE flow (${flowId})`);
  } catch (e) {
    fail('Mongo CREATE flow', e.message);
    await mongoose.disconnect();
    process.exit(1);
  }

  try {
    const doc = await Flow.findById(flowId).lean();
    if (doc?.name === 'Smoke test flow' && doc.nodes?.length === 1) {
      ok('Mongo READ flow');
    } else {
      fail('Mongo READ flow', 'datos inesperados');
    }
  } catch (e) {
    fail('Mongo READ flow', e.message);
  }

  try {
    await Flow.updateOne(
      { _id: flowId },
      {
        $set: {
          name: 'Smoke test actualizado',
          nodes: [
            StartNode,
            { id: 'node_1', type: 'text', x: 150, y: 250, question: 'Hola' },
          ],
        },
      },
    );
    const updated = await Flow.findById(flowId).lean();
    if (updated?.name === 'Smoke test actualizado' && updated.nodes?.length === 2) {
      ok('Mongo UPDATE flow');
    } else {
      fail('Mongo UPDATE flow', 'no persistió');
    }
  } catch (e) {
    fail('Mongo UPDATE flow', e.message);
  }

  try {
    await Flow.deleteOne({ _id: flowId });
    const gone = await Flow.findById(flowId).lean();
    if (!gone) ok('Mongo DELETE flow');
    else fail('Mongo DELETE flow', 'aún existe');
  } catch (e) {
    fail('Mongo DELETE flow', e.message);
  }

  // Página flows (redirige a login si no hay sesión)
  try {
    const res = await fetch(`${BASE_URL}/dashboard/flows`, { redirect: 'manual' });
    if ([200, 307, 302].includes(res.status)) {
      ok(`GET /dashboard/flows → ${res.status}`);
    } else {
      fail('GET /dashboard/flows', `status ${res.status}`);
    }
  } catch (e) {
    fail('GET /dashboard/flows', e.message);
  }

  await mongoose.disconnect();

  console.log(`\nResultado: ${passed} ok, ${failed} fallos\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
