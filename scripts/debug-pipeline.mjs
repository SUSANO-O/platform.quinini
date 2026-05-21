#!/usr/bin/env node
/** Diagnóstico rápido del pipeline (hub IDs, postHubWidgetChat paso 1). */
import crypto from 'crypto';
import { createConnection, Types } from 'mongoose';

const SIGNATURE_HEADER = 'X-Landing-Signature';

function signRequest(rawBody, secret) {
  const t = Math.floor(Date.now() / 1000);
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${bodyHash}`).digest('hex');
  return `t=${t};sha256=${sig}`;
}

const uri = process.env.MONGODB_URI || '';
const BASE = 'http://127.0.0.1:3201';
const AUTOEXPERT = '69d5084c78e0af3d5536fe95';

async function main() {
  const conn = await createConnection(uri).asPromise();
  const widget = await conn.collection('widgets').findOne({
    name: 'Mi Widget',
    agentId: AUTOEXPERT,
    multiAgentMode: 'pipeline',
  });
  if (!widget) {
    console.log('Widget pipeline no encontrado');
    process.exit(1);
  }

  const agents = await conn
    .collection('clientagents')
    .find({ _id: { $in: [new Types.ObjectId(AUTOEXPERT), ...(widget.orchestratorAgentIds || []).map((id) => new Types.ObjectId(String(id))) ] } })
    .project({ name: 1, agentHubId: 1, status: 1 })
    .toArray();
  console.log('Agentes:', agents.map((a) => ({ name: a.name, id: String(a._id), hubId: a.agentHubId, status: a.status })));

  const sub = await conn.collection('subscriptions').findOne({ userId: widget.userId });
  console.log('Plan:', sub?.plan, '| status:', sub?.status);

  const hubBase = (process.env.AIBACKHUB_URL || process.env.NEXT_PUBLIC_AIBACKHUB_URL || 'http://127.0.0.1:9003').replace(/\/$/, '');
  const secret = process.env.HUB_TO_LANDING_SECRET?.trim() || '';
  const contentAgent = agents.find((a) => String(a._id) === AUTOEXPERT);
  const hubId = contentAgent?.agentHubId;
  console.log('Hub base:', hubBase, '| secret:', !!secret, '| content hubId:', hubId);

  if (!hubId || !secret) {
    await conn.close();
    process.exit(1);
  }

  const body = JSON.stringify({
    agentId: hubId,
    widgetId: String(widget._id),
    message: 'Tarea pipeline: brief factual en viñetas sobre autos familiares del catálogo.',
    sessionId: `dbg-${Date.now()}`,
    token: widget.afhubToken,
  });
  const headers = {
    'Content-Type': 'application/json',
    'X-Widget-Token': widget.afhubToken,
    'X-Landing-Wt-Valid': '1',
    [SIGNATURE_HEADER]: signRequest(body, secret),
  };
  const apiKey = process.env.AIBACKHUB_API_KEY?.trim();
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch(`${hubBase}/api/widget/chat`, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => ({}));
  console.log('\nContent step HTTP', res.status);
  console.log('keys:', Object.keys(json));
  if (json.error) console.log('error:', json.error, json.code);
  console.log('reply len:', (json.reply || json.response || '').length);
  console.log('reply preview:', String(json.reply || json.response || '').slice(0, 300));

  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
