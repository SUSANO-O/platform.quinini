#!/usr/bin/env node
/**
 * Fuerza un POST de prueba al webhook configurado en un ClientAgent (landing Mongo).
 * No usa el LLM: comprueba URL, auth y conectividad (equivalente a "Probar webhook" del panel).
 *
 * Opcional: con BASE_URL + token, envía un mensaje al widget con email para disparar
 * el pre-fire en AIBackHub (toolsUsed debe incluir mcp:landing:webhook_post).
 *
 * Uso:
 *   MONGODB_URI="mongodb+srv://..." \
 *   AGENT_ID=69d5084c78e0af3d5536fe95 \
 *   node scripts/widget-webhook-force-test.mjs
 *
 * Con prueba vía chat (SSE):
 *   MONGODB_URI="..." AGENT_ID=69d5084c78e0af3d5536fe95 \
 *   BASE_URL=https://tu-dominio WIDGET_TOKEN=wt_... \
 *   node scripts/widget-webhook-force-test.mjs --chat
 *
 * Sin WIDGET_TOKEN: con MONGODB_URI + WIDGET_ID (default = MatIAs Auto Sales Hub) se lee afhubToken.
 */

import { createConnection, Types } from 'mongoose';

const AGENT_ID = process.env.AGENT_ID || '69d5084c78e0af3d5536fe95';
const MONGO_URI = process.env.MONGODB_URI || '';
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
const WIDGET_TOKEN = process.env.WIDGET_TOKEN || '';
const WIDGET_ID = process.env.WIDGET_ID || '6a03a54c4f69fa7fa9027170';
const CHAT_MODE = process.argv.includes('--chat');

const TEST_TIMEOUT_MS = 12_000;

function getWebhookFromTools(tools) {
  if (!Array.isArray(tools)) return null;
  const row = tools.find((t) => t?.toolId === 'webhook');
  if (!row?.config || typeof row.config !== 'object') return null;
  const url = typeof row.config.url === 'string' ? row.config.url.trim() : '';
  if (!url) return null;
  const secret = typeof row.config.secret === 'string' ? row.config.secret.trim() : '';
  return { url, secret };
}

async function loadAgentWebhook() {
  if (!MONGO_URI) {
    throw new Error('Define MONGODB_URI (misma cadena que usa la landing).');
  }
  const conn = await createConnection(MONGO_URI).asPromise();
  try {
    const col = conn.collection('clientagents');
    const doc = await col.findOne(
      { _id: new Types.ObjectId(AGENT_ID) },
      { projection: { name: 1, tools: 1 } },
    );
    if (!doc) {
      throw new Error(`No existe clientagents con _id=${AGENT_ID}`);
    }
    const hook = getWebhookFromTools(doc.tools);
    if (!hook) {
      throw new Error(
        'El agente no tiene herramienta webhook con URL. En el panel: Herramientas → Webhook → URL y Guardar.',
      );
    }
    return { hook, agentName: doc.name || '' };
  } finally {
    await conn.close();
  }
}

async function postDirectWebhook(hook) {
  const payload = {
    event: 'webhook_test',
    timestamp: new Date().toISOString(),
    source: 'matias_widget_webhook_force_test',
    message: 'Prueba forzada desde scripts/widget-webhook-force-test.mjs (datos ficticios).',
    lead: {
      name: 'Usuario de prueba MatIAs',
      email: 'prueba-webhook@ejemplo.invalid',
      phone: '+57-300-0000000',
      company: null,
      interest: 'Verificación forzada de webhook',
    },
    conversation: {
      intent: 'other',
      priority: 'low',
      needs_human: false,
    },
  };

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'MatIAsLanding-WebhookForceTest/1.0',
  };
  if (hook.secret) {
    headers.Authorization = /^Bearer\s+/i.test(hook.secret) ? hook.secret : `Bearer ${hook.secret}`;
  }

  const res = await fetch(hook.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    snippet: text.slice(0, 800),
    payload,
  };
}

async function fetchWidgetTokenFromMongo() {
  if (!MONGO_URI) return '';
  const conn = await createConnection(MONGO_URI).asPromise();
  try {
    const col = conn.collection('widgets');
    const doc = await col.findOne(
      { _id: new Types.ObjectId(WIDGET_ID) },
      { projection: { afhubToken: 1 } },
    );
    const t = doc?.afhubToken && String(doc.afhubToken).startsWith('wt_') ? String(doc.afhubToken) : '';
    return t;
  } finally {
    await conn.close();
  }
}

async function readSSEChatStream(message, token) {
  if (!BASE_URL) throw new Error('Para --chat define BASE_URL (origen de la landing).');
  if (!token || !token.startsWith('wt_')) {
    throw new Error('Token wt_* requerido: WIDGET_TOKEN o WIDGET_ID + MONGODB_URI para leer widgets.afhubToken.');
  }
  const body = {
    agentId: AGENT_ID,
    sessionId: `wh-force-${Date.now()}`,
    message,
    token,
  };
  const res = await fetch(`${BASE_URL}/api/widget/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok && res.status !== 200) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 400)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = null;
  while (true) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'done') done = evt;
      } catch {
        /* ignore */
      }
    }
  }
  return done;
}

async function main() {
  console.log('\n=== MatIAs — Webhook force test ===');
  console.log(`AGENT_ID: ${AGENT_ID}`);

  const { hook, agentName } = await loadAgentWebhook();
  console.log(`Agente: ${agentName || '(sin nombre)'}`);
  console.log(`URL webhook (primeros 60 chars): ${hook.url.slice(0, 60)}${hook.url.length > 60 ? '…' : ''}`);

  console.log('\n[1] POST directo (sin LLM)…');
  const r = await postDirectWebhook(hook);
  console.log(`HTTP ${r.status} ${r.statusText} ok=${r.ok}`);
  if (r.snippet) console.log(`Cuerpo (recorte): ${r.snippet}`);
  if (!r.ok) {
    console.error('\n✗ El endpoint del webhook no respondió 2xx. Revisa URL, firewall y auth.');
    process.exit(1);
  }
  console.log('✓ POST directo OK.');

  if (CHAT_MODE) {
    console.log('\n[2] Chat SSE con email (pre-fire hub si AIBackHub resuelve la misma URL)…');
    let wt = WIDGET_TOKEN;
    if (!wt || !wt.startsWith('wt_')) {
      wt = await fetchWidgetTokenFromMongo();
      if (wt) console.log(`Token obtenido desde widgets._id=${WIDGET_ID}`);
    }
    const email = `prueba+${Date.now()}@ejemplo.invalid`;
    const msg = `Soy cliente de prueba MatIAs Auto Sales. Me llamo Lead Force Test, mi correo es ${email}, teléfono 3001234567. Quiero pre-aprobado; registrame.`;
    const done = await readSSEChatStream(msg, wt);
    const tools = Array.isArray(done?.toolsUsed) ? done.toolsUsed : [];
    console.log('toolsUsed:', JSON.stringify(tools));
    const wh = tools.some((t) => String(t).includes('webhook'));
    if (!wh) {
      console.error(
        '\n✗ No apareció herramienta de webhook en toolsUsed. Posibles causas: hub sin sync de URL, tenant distinto, o el motor no ejecutó pre-fire.',
      );
      process.exit(2);
    }
    console.log('✓ El flujo de chat reportó uso de herramienta webhook (revisa tu receptor por duplicado).');
  } else {
    console.log('\n(Opcional) Repite con --chat + BASE_URL + WIDGET_TOKEN para validar el camino widget → hub → POST.');
  }

  console.log('\nListo.\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
