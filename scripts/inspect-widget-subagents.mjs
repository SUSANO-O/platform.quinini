#!/usr/bin/env node
/**
 * Lista sub-agentes vinculados a un ClientAgent y el token del widget (preview).
 * Uso: node --env-file=.env scripts/inspect-widget-subagents.mjs
 *
 * Env opcional: AGENT_ID, WIDGET_ID, MONGODB_URI
 */
import { createConnection, Types } from 'mongoose';

const AGENT_ID = process.env.AGENT_ID || '';
const WIDGET_ID = process.env.WIDGET_ID || '';
const uri = process.env.MONGODB_URI || '';

if (!uri) {
  console.error('Falta MONGODB_URI (o usa node --env-file=.env).');
  process.exit(1);
}

const conn = await createConnection(uri).asPromise();
try {
  const agent = await conn.collection('clientagents').findOne(
    { _id: new Types.ObjectId(AGENT_ID) },
    {
      projection: {
        name: 1,
        type: 1,
        agentHubId: 1,
        subAgentIds: 1,
        status: 1,
      },
    },
  );

  console.log('\n=== Agente principal ===');
  console.log(JSON.stringify(agent, null, 2));

  const ids = Array.isArray(agent?.subAgentIds) ? agent.subAgentIds : [];
  const oids = ids
    .map((id) => {
      try {
        return new Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (!oids.length) {
    console.log('\n(No hay subAgentIds en este documento — el padre no tiene hijos enlazados.)\n');
  } else {
    const subs = await conn
      .collection('clientagents')
      .find({ _id: { $in: oids } })
      .project({
        name: 1,
        type: 1,
        agentHubId: 1,
        parentAgentId: 1,
        status: 1,
        prompt: 1,
      })
      .toArray();

    console.log('\n=== Sub-agentes (documentos hijos) ===');
    for (const s of subs) {
      const p = typeof s.prompt === 'string' ? s.prompt : '';
      console.log(
        JSON.stringify(
          {
            ...s,
            promptPreview: p.slice(0, 280) + (p.length > 280 ? '…' : ''),
            promptLength: p.length,
            prompt: undefined,
          },
          null,
          2,
        ),
      );
    }
  }

  const w = await conn.collection('widgets').findOne(
    { _id: new Types.ObjectId(WIDGET_ID) },
    { projection: { name: 1, agentId: 1, afhubToken: 1 } },
  );
  console.log('\n=== Widget ===');
  const tok = typeof w?.afhubToken === 'string' ? w.afhubToken : '';
  console.log(
    JSON.stringify(
      {
        name: w?.name,
        agentId: w?.agentId,
        tokenPreview: tok ? `${tok.slice(0, 12)}… (${tok.length} chars)` : '(sin afhubToken)',
      },
      null,
      2,
    ),
  );
} finally {
  await conn.close();
}
