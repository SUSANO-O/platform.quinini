/**
 * Añade el evento `lead_captured` al webhook `webhook_1` de los agentes dados.
 * Por defecto: Asesor de Taller y Lab Taller (fixture).
 *
 * Sin ese evento, matchWebhooksToEvent no selecciona el webhook y el servidor
 * nunca le enruta el lead: el agente captura, HubSpot recibe, el webhook no.
 *
 * Toca SOLO el campo `events`. No modifica url, name, description, id ni secret.
 * Actualiza landing (`clientagents`) y hub (`agents`) para no desincronizarlos.
 *
 *   npx tsx --env-file=.env scripts/set-lead-event-taller.mts            (dry-run)
 *   npx tsx --env-file=.env scripts/set-lead-event-taller.mts --apply
 *   npx tsx --env-file=.env scripts/set-lead-event-taller.mts --agentes="Otro Agente" --apply
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'mongoose';

/** Agentes a parchear. Se puede sobreescribir por CLI: --agentes "A|B" */
const argAgentes = process.argv.find((a) => a.startsWith('--agentes='))?.slice('--agentes='.length);
const AGENTES = argAgentes
  ? argAgentes.split('|').map((x) => x.trim()).filter(Boolean)
  : ['Asesor de Taller', 'Lab Taller (fixture)'];
const WEBHOOK = 'webhook_1';
const EVENTO = 'lead_captured';
const APPLY = process.argv.includes('--apply');

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnvFile(p: string) {
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* opcional */
  }
}
loadEnvFile(resolve(__dirname, '../.env'));
loadEnvFile(resolve(__dirname, '../../matias-backend/.env'));

const HUB_MONGO =
  process.env.AIBACKHUB_MONGO_URI?.trim() ||
  process.env.HUB_MONGODB_URI?.trim() ||
  process.env.MONGODB_URI?.replace(/agentflowhub_landing/i, 'agentflow') ||
  '';

type Tool = { toolId?: string; config?: { webhooks?: Array<Record<string, unknown>> } };

/** Añade el evento si falta. Devuelve qué cambió. */
function parchear(tools: Tool[]): { cambio: boolean; antes: unknown } {
  let cambio = false;
  let antes: unknown = undefined;
  for (const t of tools ?? []) {
    if (String(t?.toolId) !== 'webhook') continue;
    for (const w of t?.config?.webhooks ?? []) {
      if (String(w?.name) !== WEBHOOK) continue;
      antes = w.events ?? null;
      const actuales = Array.isArray(w.events) ? w.events.map(String) : [];
      if (!actuales.includes(EVENTO)) {
        w.events = [...actuales, EVENTO];
        cambio = true;
      }
    }
  }
  return { cambio, antes };
}

const landing = await createConnection(process.env.MONGODB_URI!).asPromise();
const hub = HUB_MONGO ? await createConnection(HUB_MONGO).asPromise() : null;
const salida: Record<string, unknown>[] = [];

for (const nombre of AGENTES) {
  const doc = await landing.db!.collection('clientagents').findOne({ name: nombre });
  if (!doc) {
    salida.push({ agente: nombre, error: 'no encontrado en landing' });
    continue;
  }
  const l = parchear((doc.tools ?? []) as Tool[]);
  if (APPLY && l.cambio) {
    await landing.db!
      .collection('clientagents')
      .updateOne({ _id: doc._id }, { $set: { tools: doc.tools } });
  }

  // Espejo en el hub, si existe allí
  let h: { cambio: boolean; antes: unknown } = { cambio: false, antes: 'n/a' };
  if (hub && doc.agentHubId) {
    const hDoc = await hub.db!.collection('agents').findOne({ id: doc.agentHubId });
    if (hDoc) {
      h = parchear((hDoc.tools ?? []) as Tool[]);
      if (APPLY && h.cambio) {
        await hub.db!.collection('agents').updateOne({ id: doc.agentHubId }, { $set: { tools: hDoc.tools } });
      }
    }
  }

  salida.push({
    agente: nombre,
    webhook: WEBHOOK,
    landing: { eventosAntes: l.antes, cambia: l.cambio },
    hub: { eventosAntes: h.antes, cambia: h.cambio },
  });
}

console.log(JSON.stringify({ modo: APPLY ? 'APLICADO' : 'dry-run', evento: EVENTO, agentes: salida }, null, 2));

await landing.close();
if (hub) await hub.close();
