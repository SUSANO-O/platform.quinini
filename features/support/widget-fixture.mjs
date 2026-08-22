/**
 * Resuelve un widget de prueba real desde Mongo por palabra clave en el
 * nombre del agente/widget (misma estrategia que scripts/audit-taller-memory.mjs):
 * prioriza fixtures marcados "lab"/"fixture" para no depender de datos de un
 * cliente real. Requiere MONGODB_URI (igual que el resto de la suite BDD).
 */
import { MongoClient, ObjectId } from 'mongodb'

const BASE_LANDING = 'agentflowhub_landing'
let cachedClient = null

async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI)
    await cachedClient.connect()
  }
  return cachedClient.db(BASE_LANDING)
}

export async function findTestWidget(keyword) {
  const db = await getDb()
  const widgets = await db
    .collection('widgets')
    .find({ active: { $ne: false } }, { projection: { agentId: 1, afhubToken: 1, name: 1 } })
    .toArray()

  const re = new RegExp(keyword, 'i')
  const candidates = []
  for (const w of widgets) {
    if (!w.afhubToken?.startsWith('wt_') || !ObjectId.isValid(w.agentId)) continue
    const agent = await db
      .collection('clientagents')
      .findOne({ _id: new ObjectId(w.agentId) }, { projection: { name: 1, agentHubId: 1 } })
    if (!agent) continue
    if (!re.test(String(agent.name)) && !re.test(String(w.name || ''))) continue
    candidates.push({ widget: w, agent })
  }

  const picked =
    candidates.find((x) => /lab|fixture/i.test(String(x.agent.name)) || /lab|fixture/i.test(String(x.widget.name || ''))) ??
    candidates[0]

  if (!picked) {
    throw new Error(`No se encontró ningún widget activo con agente que matchee /${keyword}/i (¿falta el fixture de prueba?)`)
  }

  return {
    widgetId: String(picked.widget._id),
    agentId: String(picked.agent._id),
    token: picked.widget.afhubToken,
    agentName: picked.agent.name,
  }
}

export async function closeFixtureConnection() {
  if (cachedClient) {
    await cachedClient.close()
    cachedClient = null
  }
}
