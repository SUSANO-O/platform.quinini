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

function inventoryProbe(reply) {
  const r = reply || '';
  const repRefs = (r.match(/\bREP-\d+/gi) ?? []).length;
  return {
    repRefs,
    mentionsStock: /\bstock\b/i.test(r),
    mentionsSede: /\bsede\b/i.test(r),
    emptyInventory: /(no (he |pude |encontr|hay)|sin resultados|no arroj[oó]|inventario vac)/i.test(r),
    asksLead: /(nombre|tel[eé]fono|correo|agendar|cita|especialista de producto|d[eé]jame tus datos)/i.test(r),
  };
}

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
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/widget/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Widget-Token': token },
    body: JSON.stringify({ agentId: AGENT_ID, widgetId: WIDGET_ID, token, message, sessionId }),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, ms: Date.now() - t0 };
}

function scoreReply(q, reply, tools, inv) {
  const usedSheet = tools.some((t) => /sheet/i.test(String(t)));
  const asksLead = inv.asksLead;
  const noAccess = /(no tengo acceso|no puedo consultar|especialista|supervisor|financiar tu pr[oó]ximo|estrenar un veh[ií]culo)/i.test(reply || '');

  if (q.id === 'n2-oem-pe5r') {
    const ok = /buj[ií]a|iridio|mazda|skyactiv/i.test((reply || '').toLowerCase()) && usedSheet && !asksLead;
    return ok ? 'PASS' : usedSheet && !asksLead ? 'PARTIAL' : usedSheet ? 'PARTIAL' : 'FAIL';
  }
  if (q.id === 'n1-explicit-sheet') {
    return usedSheet && !noAccess && !asksLead && inv.repRefs > 0 ? 'PASS' : usedSheet ? 'PARTIAL' : 'FAIL';
  }
  if (usedSheet && !noAccess && !asksLead && inv.repRefs > 0) return 'PASS';
  if (usedSheet && !noAccess && !asksLead) return 'PARTIAL';
  if (usedSheet) return 'PARTIAL';
  if (asksLead && !usedSheet) return 'FAIL';
  return noAccess ? 'FAIL' : 'PARTIAL';
}

function formatInv(inv) {
  const bits = [];
  if (inv.repRefs) bits.push(`${inv.repRefs} REP`);
  if (inv.mentionsStock) bits.push('stock');
  if (inv.mentionsSede) bits.push('sede');
  if (inv.emptyInventory) bits.push('vacío');
  if (inv.asksLead) bits.push('pide contacto');
  return bits.length ? bits.join(', ') : 'sin señales';
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
const rows = [];

for (const q of QUESTIONS) {
  const sid = `stress-${q.id}-${Date.now()}`;
  const { status, json, ms } = await chat(token, q.message, sid);
  const reply = typeof json.reply === 'string' ? json.reply : '';
  const tools = Array.isArray(json.toolsUsed) ? json.toolsUsed : [];
  const inv = inventoryProbe(reply);
  const verdict = scoreReply(q, reply, tools, inv);

  if (verdict === 'PASS') pass++;
  else if (verdict === 'PARTIAL') partial++;
  else fail++;

  rows.push({ id: q.id, level: q.level, verdict, ms, tools, inv });

  console.log('─'.repeat(72));
  console.log(`[${q.level}] ${q.id} → ${verdict}`);
  console.log(
    `HTTP ${status} | ${(ms / 1000).toFixed(1)}s | tools: ${tools.length ? tools.join(', ') : '(ninguna)'} | inventario: ${formatInv(inv)}`,
  );
  if (json.multiAgent) console.log(`multiAgent: ${JSON.stringify(json.multiAgent)}`);
  console.log(`P: ${q.message.slice(0, 100)}…`);
  console.log(`R: ${reply.slice(0, 500)}${reply.length > 500 ? '…' : ''}`);
  console.log('');
}

console.log('═'.repeat(72));
console.log(`Resumen: ${pass} PASS, ${partial} PARTIAL, ${fail} FAIL / ${QUESTIONS.length} total`);
console.log('');
console.log('Tabla rápida:');
console.log('  ID                      | ms    | tool sheet | REP | vacío | veredicto');
for (const r of rows) {
  const sheet = r.tools.some((t) => /sheet/i.test(t)) ? 'sí' : 'no';
  console.log(
    `  ${r.id.padEnd(23)} | ${String(Math.round(r.ms / 1000) + 's').padStart(5)} | ${sheet.padEnd(10)} | ${String(r.inv.repRefs).padStart(3)} | ${(r.inv.emptyInventory ? 'sí' : 'no').padEnd(5)} | ${r.verdict}`,
  );
}
console.log('');
console.log('Tip: en AIBackHub busca `[sheet] fetch` y `[mcp-chat] inventario sheet` en Cloud Run logs.');
console.log('Tip: en landing activa DEBUG_WIDGET_FLOW=1 para ver tools + señales inventario por request.');
process.exit(fail > 0 && pass === 0 ? 1 : 0);
