#!/usr/bin/env node
/**
 * Pruebas de estrés inventario / mostrador — widget Asesor Taller.
 *
 *   BASE_URL=https://botiva.space node --env-file=.env scripts/widget-stress-inventory.mjs
 */
import { createConnection, Types } from 'mongoose';
import { loadWidgetTestEnv, getBaseUrl, DEFAULT_WIDGET_ID, DEFAULT_AGENT_ID } from './lib/load-env.mjs';

loadWidgetTestEnv();

const BASE = getBaseUrl();
const WIDGET_ID = process.env.WIDGET_ID || DEFAULT_WIDGET_ID;
const AGENT_ID = process.env.AGENT_ID || DEFAULT_AGENT_ID;

const QUESTIONS = [
  {
    id: 'n1-tracker-gabriel',
    level: 'N1',
    message:
      'Buenas tardes. ¿Tiene el amortiguador delantero izquierdo para una Chevrolet Tracker 2017? El mecánico me dijo que la marca Gabriel sale buena.',
  },
  {
    id: 'n1-oroch-kit',
    level: 'N1',
    message:
      'Llegó un cliente con una Renault Oroch 2021 buscando el kit de distribución, pero no lo encuentro por ese nombre. ¿Qué otro carro usa exactamente el mismo motor y kit para buscarlo?',
  },
  {
    id: 'n1-beat-pastillas',
    level: 'N1',
    message:
      'Tengo un cliente pidiendo pastillas de freno para un Chevrolet Beat. Si no tenemos ACDelco, ¿qué otras marcas manejamos (Bosch, Valeo, Fremax) que le sirvan?',
  },
  {
    id: 'n2-oem-pe5r',
    level: 'N2',
    message:
      "Me acaba de escribir un taller pidiendo disponibilidad de la referencia 'PE5R-18-110'. Sin buscar la descripción, ¿de qué repuesto estamos hablando y para qué marca de carro es?",
  },
  {
    id: 'n3-sede-amort',
    level: 'N3',
    message:
      'El sistema dice que tenemos amortiguadores delanteros para Tracker en la Sede Norte - Pasillo C y el cliente está aquí en la Sede Sur. ¿Qué hacemos? ¿Le ofreces solo el derecho, miras si hay otra marca aquí, o cuánto tiempo le prometes para el traslado?',
  },
  {
    id: 'n4-picanto-combo',
    level: 'N4',
    message:
      'Hay un lote de repuestos para Kia Picanto que no se mueve. ¿Qué combo de mantenimiento preventivo armarías (filtros, bujías, aceite)?',
  },
  {
    id: 'n1-explicit-sheet',
    level: 'N1+',
    message:
      'Busca en el inventario de la hoja de ventas: amortiguador delantero izquierdo Chevrolet Tracker 2017 marca Gabriel. Dime referencia, stock y sede.',
  },
];

async function resolveToken() {
  if (process.env.WIDGET_TOKEN?.trim()) return process.env.WIDGET_TOKEN.trim();
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('Falta WIDGET_TOKEN o MONGODB_URI');
  const conn = await createConnection(uri).asPromise();
  try {
    const w = await conn.db.collection('widgets').findOne({ _id: new Types.ObjectId(WIDGET_ID) });
    const token = w?.afhubToken || w?.publicToken || w?.token || '';
    if (!token) throw new Error(`Widget ${WIDGET_ID} sin token`);
    return String(token);
  } finally {
    await conn.close();
  }
}

async function chat(token, message, sessionId) {
  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Widget-Token': token },
    body: JSON.stringify({ agentId: AGENT_ID, widgetId: WIDGET_ID, token, message, sessionId }),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function scoreReply(q, reply, tools) {
  const r = (reply || '').toLowerCase();
  const usedSheet = tools.some((t) => /sheet/i.test(String(t)));
  const asksLead = /(nombre|tel[eé]fono|correo|contacto|cita|agendar|especialista de producto|d[eé]jame tus datos)/i.test(reply || '');
  const noAccess = /(no tengo acceso|no puedo consultar|especialista|supervisor|financiar tu pr[oó]ximo|estrenar un veh[ií]culo)/i.test(reply || '');

  if (q.id === 'n2-oem-pe5r') {
    const ok = /buj[ií]a|iridio|mazda|skyactiv/i.test(r) && usedSheet && !asksLead;
    return ok ? 'PASS' : usedSheet && !asksLead ? 'PARTIAL' : usedSheet ? 'PARTIAL' : 'FAIL';
  }
  if (q.id === 'n1-explicit-sheet') {
    return usedSheet && !noAccess && !asksLead ? 'PASS' : usedSheet ? 'PARTIAL' : 'FAIL';
  }
  if (usedSheet && !noAccess && !asksLead) return 'PASS';
  if (usedSheet) return 'PARTIAL';
  if (asksLead && !usedSheet) return 'FAIL';
  return noAccess ? 'FAIL' : 'PARTIAL';
}

const token = await resolveToken();
console.log(`\n🔧 Widget stress inventario`);
console.log(`   URL: ${BASE}`);
console.log(`   Widget: ${WIDGET_ID}`);
console.log(`   Agent:  ${AGENT_ID}`);
console.log(`   Token:  ${token.slice(0, 10)}…\n`);

let pass = 0;
let partial = 0;
let fail = 0;

for (const q of QUESTIONS) {
  const sid = `stress-${q.id}-${Date.now()}`;
  const { status, json } = await chat(token, q.message, sid);
  const reply = typeof json.reply === 'string' ? json.reply : '';
  const tools = Array.isArray(json.toolsUsed) ? json.toolsUsed : [];
  const verdict = scoreReply(q, reply, tools);

  if (verdict === 'PASS') pass++;
  else if (verdict === 'PARTIAL') partial++;
  else fail++;

  console.log('─'.repeat(72));
  console.log(`[${q.level}] ${q.id} → ${verdict}`);
  console.log(`HTTP ${status} | tools: ${tools.length ? tools.join(', ') : '(ninguna)'}`);
  if (json.multiAgent) console.log(`multiAgent: ${JSON.stringify(json.multiAgent)}`);
  console.log(`P: ${q.message.slice(0, 100)}…`);
  console.log(`R: ${reply.slice(0, 500)}${reply.length > 500 ? '…' : ''}`);
  console.log('');
}

console.log('═'.repeat(72));
console.log(`Resumen: ${pass} PASS, ${partial} PARTIAL, ${fail} FAIL / ${QUESTIONS.length} total`);
process.exit(fail > 0 && pass === 0 ? 1 : 0);
