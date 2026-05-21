#!/usr/bin/env node
/** Configura Mi Widget con 2 orquestadores para prueba E2E multi-orquestador. */
import { createConnection, Types } from 'mongoose';
import { bustWidgetTokenCache } from './lib/bust-widget-cache.mjs';

const uri = process.env.MONGODB_URI || '';
if (!uri) {
  console.error('MONGODB_URI required');
  process.exit(1);
}

async function main() {
  const conn = await createConnection(uri).asPromise();
  const widget = await conn.collection('widgets').findOne(
    { name: 'Mi Widget', multiAgentEnabled: true, afhubToken: /^wt_/ },
    { projection: { _id: 1, userId: 1, agentId: 1, name: 1, afhubToken: 1 } },
  );
  if (!widget) {
    console.log('No se encontró Mi Widget con multiAgentEnabled=true');
    await conn.close();
    return;
  }
  const userId = String(widget.userId);
  const primary = String(widget.agentId);
  const agents = await conn
    .collection('clientagents')
    .find({ userId, type: 'agent', status: 'active', _id: { $ne: new Types.ObjectId(primary) } })
    .project({ name: 1, subAgentIds: 1 })
    .limit(20)
    .toArray();
  const second =
    agents.find((a) => Array.isArray(a.subAgentIds) && a.subAgentIds.length > 0) || agents[0];
  if (!second) {
    console.log('No hay segundo agente para el mismo usuario');
    await conn.close();
    return;
  }
  const secondId = String(second._id);
  await conn.collection('widgets').updateOne(
    { _id: widget._id },
    {
      $set: {
        multiAgentEnabled: true,
        multiAgentMode: 'pipeline',
        orchestratorAgentIds: [secondId],
        agentIds: [],
      },
    },
  );
  console.log('OK — Mi Widget multi-orquestador (modo pipeline):');
  console.log('  primary:', primary);
  console.log('  + orchestrator:', second.name, secondId);

  if (widget.afhubToken) {
    const busted = await bustWidgetTokenCache(String(widget.afhubToken), String(widget._id));
    console.log(busted ? '  cache wt invalidado' : '  (cache wt no invalidado — revisa REDIS_URL/REDIS_TOKEN)');
  }

  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
