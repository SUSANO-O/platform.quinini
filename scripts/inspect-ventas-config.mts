/**
 * Inspección segura del Asesor de Ventas (sin URLs, tokens ni PII).
 *
 *   npx tsx --env-file=.env scripts/inspect-ventas-config.mts
 */
import { createConnection, Types } from 'mongoose';

const AGENT_ID = '6a80f6a6543cb99549025dd2';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta MONGODB_URI');
  const c = await createConnection(uri).asPromise();
  const agents = c.db!.collection('clientagents');
  const widgets = c.db!.collection('widgets');
  const latency = c.db!.collection('widgetchatlatencies');
  const oid = new Types.ObjectId(AGENT_ID);
  const a = await agents.findOne({ _id: oid });
  const w = await widgets.findOne({
    $or: [{ agentId: AGENT_ID }, { agentId: oid }, { primaryAgentId: AGENT_ID }],
  });
  const tools = Array.isArray(a?.tools) ? a!.tools : [];
  const webhooks: unknown[] = [];
  for (const t of tools as Array<{ toolId?: string; config?: Record<string, unknown> }>) {
    const tid = String(t?.toolId || '');
    const cfg = t?.config && typeof t.config === 'object' ? t.config : {};
    if (tid !== 'webhook' && tid !== 'webhooks') continue;
    const arr = Array.isArray(cfg.webhooks) ? cfg.webhooks : [];
    if (arr.length) {
      for (const e of arr as Array<Record<string, unknown>>) {
        webhooks.push({
          name: e?.name ?? null,
          description: typeof e?.description === 'string' ? String(e.description).slice(0, 180) : '',
          events: Array.isArray(e?.events) ? e.events : null,
          hasUrl: typeof e?.url === 'string' && String(e.url).trim().length > 0,
        });
      }
    } else {
      webhooks.push({
        name: 'legacy',
        description: '',
        events: null,
        hasUrl: typeof cfg.url === 'string' && String(cfg.url).trim().length > 0,
      });
    }
  }
  const mcp = Array.isArray(a?.enabledMcpToolIds) ? a!.enabledMcpToolIds : [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const traces = await latency
    .find({ createdAt: { $gte: since }, $or: [{ agentId: AGENT_ID }, { agentHubId: 'asesor-de-ventas' }] })
    .project({ createdAt: 1, ok: 1, toolsUsed: 1, path: 1, totalMs: 1 })
    .sort({ createdAt: -1 })
    .limit(8)
    .toArray();
  console.log(
    JSON.stringify(
      {
        agent: a
          ? {
              id: String(a._id),
              name: a.name,
              agentHubId: a.agentHubId ?? null,
              hubspotAutoCaptureContacts: a.hubspotAutoCaptureContacts === true,
              toolIds: (tools as Array<{ toolId?: string }>).map((t) => t?.toolId).filter(Boolean),
              hubspotTools: mcp.filter((id: unknown) => String(id).includes('hubspot')),
            }
          : null,
        widget: w ? { id: String(w._id), name: w.name } : null,
        webhooks,
        recentTurns: traces.map((t) => ({
          at: t.createdAt,
          ok: t.ok,
          path: t.path,
          ms: t.totalMs,
          toolsUsed: t.toolsUsed ?? [],
        })),
      },
      null,
      2,
    ),
  );
  await c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
