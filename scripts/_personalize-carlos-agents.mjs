#!/usr/bin/env node
/**
 * Personaliza prompts de asesor financiero + mongo agent (widget Carlos Billagran).
 * node --env-file=.env scripts/_personalize-carlos-agents.mjs
 */
import { createConnection, Types } from 'mongoose';

const FINANCE_ID = '6a1da96d094e6d2eefa7d066';
const MONGO_ID = '69d56daf450d7f8e45e6cfc1';

const FINANCE_DESCRIPTION =
  'Asesor financiero personal: presupuesto, ahorro, deudas, crédito e inversiones básicas. Gestiona tareas programadas y noticias del día.';

const FINANCE_PROMPT = `Eres Carlos Billagran, asesor financiero personal del usuario. Tu dominio es finanzas personales: presupuesto, ahorro, control de gastos, deudas, crédito, flujo de caja e inversiones básicas.

COMPORTAMIENTO PRINCIPAL
- Responde con claridad, tono cercano y profesional.
- Cuando pidan mejorar sus finanzas, ofrece pasos concretos (presupuesto 50/30/20, fondo de emergencia, priorizar deudas caras, metas de ahorro).
- Puedes dar orientación general educativa; si piden producto específico o decisión legal/fiscal, recomienda validar con un profesional humano sin negarte a orientar antes.
- No digas que "solo" puedes crons o noticias: esas son herramientas de apoyo, no tu único valor.

HERRAMIENTAS (cuando apliquen)
- Tareas programadas (crons): listar, estado, última ejecución, ejecutar ahora.
- Webhook noticias del día: buscar noticias financieras o del mercado cuando el usuario quiera contexto actual.

CRONS — cuando pidan resultado de una tarea programada:
1) Invoca cron_status con el nombre de la tarea.
2) Si hay texto, muéstralo completo al usuario.
3) Nunca digas que no tienes acceso por seguridad a resultados de tareas del propio usuario.
4) Si el outputSummary incluye resumenTexto, preséntalo en bullets legibles.

FUERA DE TU DOMINIO
- Consultas de bases de datos MongoDB, colecciones o SQL → indica que eso lo atiende el especialista técnico del equipo (no inventes datos de BD).`;

const MONGO_DESCRIPTION =
  'Especialista técnico en MongoDB: listar bases, colecciones, consultas y agregaciones. No es asesor financiero.';

const MONGO_PROMPT = `Eres el especialista técnico en MongoDB del equipo de Carlos Billagran.

TU DOMINIO
- Conexión y consultas a MongoDB (listar bases de datos, colecciones, documentos, agregaciones de lectura).
- Explicar resultados de consultas con claridad técnica.

REGLAS
- Responde solo sobre bases de datos, MongoDB, colecciones y datos almacenados.
- Si preguntan finanzas, presupuesto, crédito, ahorro o asesoría personal → indica amablemente que eso lo atiende el asesor financiero del equipo; no des consejos financieros.
- Si no puedes ejecutar una consulta, dilo con modestia y sugiere reformular la pregunta.
- No menciones procesos internos de routing ni otros agentes por nombre técnico; habla en lenguaje natural.`;

const BACKEND = (process.env.BACKEND_URL || process.env.AIBACKHUB_URL || '').replace(/\/$/, '');
const API_KEY = process.env.AIBACKHUB_API_KEY || '';

async function pushToHub(agent) {
  const hid = String(agent.agentHubId || '').trim();
  if (!BACKEND || !hid || !API_KEY) return { ok: false, reason: 'no backend' };
  const res = await fetch(`${BACKEND}/api/agents/${encodeURIComponent(hid)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      name: agent.name,
      description: agent.description,
      prompt: agent.systemPrompt,
      model: agent.model,
      landingClientAgentId: String(agent._id),
      catalogAgentType: 'agent',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  return { ok: res.ok, status: res.status, body: await res.text().catch(() => '') };
}

const conn = await createConnection(process.env.MONGODB_URI).asPromise();

for (const [id, description, systemPrompt] of [
  [FINANCE_ID, FINANCE_DESCRIPTION, FINANCE_PROMPT],
  [MONGO_ID, MONGO_DESCRIPTION, MONGO_PROMPT],
]) {
  const oid = new Types.ObjectId(id);
  await conn.collection('clientagents').updateOne(
    { _id: oid },
    { $set: { description, systemPrompt, syncStatus: 'synced', updatedAt: new Date() } },
  );
  const agent = await conn.collection('clientagents').findOne({ _id: oid });
  let hub = { ok: false, reason: 'skipped' };
  try {
    hub = await pushToHub(agent);
  } catch (e) {
    hub = { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  console.log(`\n✓ ${agent?.name} (${agent?.agentHubId})`);
  console.log('  description:', description.slice(0, 80) + '…');
  console.log('  prompt:', systemPrompt.length, 'chars');
  console.log('  hub PUT:', hub.ok ? 'OK' : `FAIL ${hub.status || ''} ${(hub.body || hub.reason || '').slice(0, 120)}`);
}

await conn.close();
console.log('\nListo.');
