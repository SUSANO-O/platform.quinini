#!/usr/bin/env node
/** Encuentra candidato para prueba multiagente y opcionalmente lo activa. */
import { createConnection, Types } from 'mongoose';

const uri = process.env.MONGODB_URI || '';
const APPLY = process.env.APPLY === '1';

async function main() {
  const conn = await createConnection(uri).asPromise();

  const subs = await conn
    .collection('subscriptions')
    .find({ plan: { $in: ['business', 'enterprise'] }, status: { $in: ['active', 'trialing'] } })
    .project({ userId: 1, plan: 1, status: 1 })
    .limit(10)
    .toArray();

  console.log('Business/Enterprise subs:', subs.length);

  for (const sub of subs) {
    const userId = String(sub.userId);
    const widgets = await conn.collection('widgets').find({ userId }).limit(5).toArray();
    const agents = await conn
      .collection('clientagents')
      .find({ userId, type: 'agent', status: 'active' })
      .project({ name: 1, subAgentIds: 1 })
      .toArray();

    const withSubs = agents.filter((a) => Array.isArray(a.subAgentIds) && a.subAgentIds.length > 0);
    console.log('\nuserId', userId, 'plan', sub.plan, '| widgets', widgets.length, '| agents w/subs', withSubs.length);

    if (!widgets.length || !withSubs.length) continue;

    const orch = withSubs[0];
    const widget = widgets.find((w) => String(w.agentId) === String(orch._id)) || widgets[0];

    console.log('  orchestrator:', orch.name, orch._id);
    console.log('  subAgentIds:', (orch.subAgentIds || []).slice(0, 3));
    console.log('  widget:', widget.name, widget._id, '| multiAgentEnabled:', widget.multiAgentEnabled);

    if (APPLY && !widget.multiAgentEnabled) {
      await conn.collection('widgets').updateOne(
        { _id: widget._id },
        {
          $set: {
            multiAgentEnabled: true,
            multiAgentMode: 'triage',
            agentIds: [],
            agentId: String(orch._id),
          },
        },
      );
      console.log('  → ACTIVADO multiAgentEnabled=true + agentId=orchestrator (triage)');
    } else if (APPLY && String(widget.agentId) !== String(orch._id)) {
      await conn.collection('widgets').updateOne(
        { _id: widget._id },
        { $set: { agentId: String(orch._id) } },
      );
      console.log('  → agentId alineado al orquestador');
    }

    console.log('  token:', widget.afhubToken?.slice(0, 12) + '…');
    break;
  }

  await conn.close();
}

main().catch(console.error);
