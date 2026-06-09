#!/usr/bin/env node
/**
 * Prueba aislada — dos flujos WhatsApp distintos en BotIvA:
 *
 *   FLUJO A — Chat agente (visitante ↔ Business WA del agente)
 *     FROM: número Business conectado al agente (displayPhone / phoneNumberId)
 *     TO:   teléfono del visitante que escribió por WhatsApp
 *     Cuándo: webhook recibe mensaje del visitante; bot o humano responde.
 *
 *   FLUJO B — Alerta handoff (formulario «Hablar con una persona»)
 *     FROM: mismo número Business del agente (validado en Meta)
 *     TO:   humanSupportPhone del widget (+57 … dueño / operador)
 *     Cuándo: POST /api/widgets/[id]/handoff
 *     Mensaje: quién pide atención, widget, mensaje del visitante.
 *
 * Uso:
 *   node --env-file=.env scripts/test-whatsapp-flows-isolated.mjs
 *   FLOW=handoff BASE=https://botiva.space node --env-file=.env scripts/test-whatsapp-flows-isolated.mjs
 *   FLOW=both FLOW_A_TO=573133174629 node --env-file=.env scripts/test-whatsapp-flows-isolated.mjs
 */
import crypto from 'crypto';
import { createConnection, Types } from 'mongoose';
import { loadWidgetTestEnv, DEFAULT_WIDGET_ID, DEFAULT_AGENT_ID, getBaseUrl } from './lib/load-env.mjs';

loadWidgetTestEnv();

const WIDGET_ID = process.env.WIDGET_ID || DEFAULT_WIDGET_ID;
const AGENT_ID = process.env.AGENT_ID || DEFAULT_AGENT_ID;
const BASE = (process.env.BASE || process.env.BASE_URL || getBaseUrl()).replace(/\/$/, '');
const FLOW = (process.env.FLOW || 'both').toLowerCase(); // handoff | agent | both
const uri = process.env.MONGODB_URI || '';

if (!uri) {
  console.error('Falta MONGODB_URI');
  process.exit(1);
}

function resolveKey() {
  const raw = process.env.SECRET_ENCRYPTION_KEY?.trim();
  if (raw) {
    try {
      const asHex = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
      const buf = asHex || Buffer.from(raw, 'base64');
      if (buf.length === 32) return buf;
    } catch { /* fallthrough */ }
  }
  const jwt = process.env.JWT_SECRET?.trim();
  if (jwt) {
    return crypto.createHash('sha256').update('whatsapp-secret-v1:' + jwt).digest();
  }
  return null;
}

function decryptSecret(payload) {
  const key = resolveKey();
  if (!key || typeof payload !== 'string') return '';
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return '';
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const enc = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

async function graphSendText(wa, token, toPhone, text) {
  const phoneNumberId = String(wa.phoneNumberId || '').trim();
  const version = String(wa.apiVersion || 'v21.0').trim();
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizePhoneDigits(toPhone),
      type: 'text',
      text: { preview_url: false, body: text.slice(0, 4096) },
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { http: res.status, ok: res.ok, data };
}

async function loadContext(conn) {
  const widget = await conn.collection('widgets').findOne(
    { _id: new Types.ObjectId(WIDGET_ID) },
    { projection: { name: 1, humanSupportPhone: 1, afhubToken: 1, userId: 1 } },
  );
  const agent = await conn.collection('clientagents').findOne(
    { _id: new Types.ObjectId(AGENT_ID) },
    { projection: { name: 1, whatsapp: 1, userId: 1 } },
  );
  const user = widget?.userId
    ? await conn.collection('users').findOne(
        { _id: widget.userId },
        { projection: { ownerWaLastInboundAt: 1, escalationWhatsAppPhone: 1 } },
      )
    : null;
  return { widget, agent, user };
}

function printHeader(title) {
  console.log('\n' + '═'.repeat(72));
  console.log(title);
  console.log('═'.repeat(72));
}

async function testFlowBHandoffApi(conn, ctx) {
  printHeader('FLUJO B — Alerta handoff vía API (como el widget)');
  const token = ctx.widget?.afhubToken;
  if (!token) {
    console.log('❌ Widget sin afhubToken');
    return;
  }
  const sessionId = `isolated_handoff_${Date.now()}`;
  const body = {
    sessionId,
    visitorId: 'isolated_test_visitor',
    userMessage: 'Test aislado flujo B — petición de humano',
    contactInfo: {
      name: 'Test Aislado B',
      phone: ctx.widget?.humanSupportPhone || '',
      email: 'test-aislado@botiva.space',
    },
    agentId: AGENT_ID,
    token,
  };

  console.log('POST', `${BASE}/api/widgets/${WIDGET_ID}/handoff`);
  console.log('FROM (Business agente):', ctx.agent?.whatsapp?.displayPhone || '?', '| phoneNumberId:', ctx.agent?.whatsapp?.phoneNumberId);
  console.log('TO (humanSupportPhone):', ctx.widget?.humanSupportPhone);
  console.log('sessionId:', sessionId);

  const res = await fetch(`${BASE}/api/widgets/${WIDGET_ID}/handoff`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': token,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  console.log('\nHTTP', res.status);
  console.log('waNotification:', JSON.stringify(json.waNotification, null, 2));

  await new Promise((r) => setTimeout(r, 4000));

  const ho = await conn.collection('conversationsessions').findOne(
    { chatSessionId: sessionId },
    { projection: { sessionId: 1, handoffWaNotifMsgId: 1, handoffWaDeliveryError: 1 } },
  );
  console.log('\nMongo handoff session:', JSON.stringify(ho, null, 2));
  if (ho?.handoffWaDeliveryError) {
    console.log('\n⚠️  Meta NO entregó el mensaje:', ho.handoffWaDeliveryError);
    console.log('   Causa típica: "Re-engagement message" = texto libre fuera de ventana 24 h.');
    console.log('   Solución sin plantilla: el dueño escribe primero al número Business', ctx.agent?.whatsapp?.displayPhone);
  } else if (json.waNotification?.ok && !json.waNotification?.serviceWindowOpen) {
    console.log('\n⚠️  Meta aceptó (wamid) pero serviceWindowOpen=false — entrega puede fallar en segundos.');
  }
}

async function testFlowADirect(ctx) {
  printHeader('FLUJO A — Agente → visitante (Graph API directo, simula respuesta bot)');
  const wa = ctx.agent?.whatsapp;
  if (!wa?.accessTokenEnc) {
    console.log('❌ Agente sin WhatsApp conectado');
    return;
  }
  const token = decryptSecret(wa.accessTokenEnc);
  if (!token) {
    console.log('❌ No se pudo descifrar accessToken (SECRET_ENCRYPTION_KEY en .env)');
    return;
  }

  const toPhone = process.env.FLOW_A_TO || ctx.widget?.humanSupportPhone || '';
  if (!toPhone) {
    console.log('❌ Define FLOW_A_TO o humanSupportPhone en widget');
    return;
  }

  const text =
    process.env.FLOW_A_TEXT ||
    '🤖 [Test Flujo A] Respuesta del agente AutoExpert — chat visitante↔Business.';

  console.log('FROM (Business):', wa.displayPhone, '| phoneNumberId:', wa.phoneNumberId);
  console.log('TO (visitante/simulado):', toPhone);
  console.log('Texto:', text.slice(0, 120));

  const result = await graphSendText(wa, token, toPhone, text);
  console.log('\nGraph API HTTP', result.http);
  console.log(JSON.stringify(result.data, null, 2));
  if (result.data?.error) {
    console.log('\nNota Flujo A: si el visitante NO escribió primero al Business en 24 h, también falla entrega.');
  }
}

async function testFlowBDirect(ctx) {
  printHeader('FLUJO B — Alerta handoff (Graph API directo, mismo cuerpo que producción)');
  const wa = ctx.agent?.whatsapp;
  if (!wa?.accessTokenEnc) {
    console.log('❌ Agente sin WhatsApp conectado');
    return;
  }
  const token = decryptSecret(wa.accessTokenEnc);
  if (!token) {
    console.log('❌ No se pudo descifrar accessToken (SECRET_ENCRYPTION_KEY en .env)');
    return;
  }

  const toPhone = ctx.widget?.humanSupportPhone || '';
  const body = [
    '🔔 *Nueva solicitud de atención humana*',
    '👤 Test Aislado B — Asesor Taller',
    '💬 "Test aislado flujo B — petición de humano"',
    '',
    '↩️ *Responde ESTE mensaje* (usa Reply/Responder en WhatsApp) para contestar al visitante en tiempo real.',
  ].join('\n');

  console.log('FROM (Business validado Meta):', wa.displayPhone, '| phoneNumberId:', wa.phoneNumberId);
  console.log('TO (dueño humanSupportPhone):', toPhone);
  console.log('ownerWaLastInboundAt:', ctx.user?.ownerWaLastInboundAt || null);

  const result = await graphSendText(wa, token, toPhone, body);
  console.log('\nGraph API HTTP', result.http);
  console.log(JSON.stringify(result.data, null, 2));
  const wamid = result.data?.messages?.[0]?.id;
  if (wamid) {
    console.log('\nMeta aceptó wamid:', wamid);
    console.log('Si no llega al celular → webhook status failed "Re-engagement message" (ventana 24 h cerrada).');
  }
}

const conn = await createConnection(uri).asPromise();
const ctx = await loadContext(conn);

printHeader('Contexto widget + agente');
console.log('Widget:', ctx.widget?.name, WIDGET_ID);
console.log('humanSupportPhone (TO handoff):', ctx.widget?.humanSupportPhone);
console.log('Agente:', ctx.agent?.name, AGENT_ID);
console.log('Business WA (FROM ambos flujos):', ctx.agent?.whatsapp?.displayPhone, '| id:', ctx.agent?.whatsapp?.phoneNumberId);
console.log('BASE:', BASE);
console.log('FLOW:', FLOW);
console.log('tokenDecrypt local:', ctx.agent?.whatsapp?.accessTokenEnc ? Boolean(decryptSecret(ctx.agent.whatsapp.accessTokenEnc)) : false);

if (FLOW === 'handoff' || FLOW === 'both') {
  await testFlowBHandoffApi(conn, ctx);
  if (decryptSecret(ctx.agent?.whatsapp?.accessTokenEnc || '')) {
    await testFlowBDirect(ctx);
  }
}
if (FLOW === 'agent' || FLOW === 'both') {
  await testFlowADirect(ctx);
}

await conn.close();
printHeader('Fin');
