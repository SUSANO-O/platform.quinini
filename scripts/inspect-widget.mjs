#!/usr/bin/env node
/**
 * Inspección rápida de un widget + agente landing + agente hub + catálogo modelo.
 *
 *   node scripts/inspect-widget.mjs [widgetId]
 *   node scripts/inspect-widget.mjs 6a03a54c4f69fa7fa9027170
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection, Types } from 'mongoose';

const WIDGET_ID = process.argv[2] || '6a03a54c4f69fa7fa9027170';
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(__dirname, '../.env'));
loadEnvFile(resolve(__dirname, '../../AIBackHub/.env'));

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* optional */ }
}

const HUB_MONGO =
  process.env.AIBACKHUB_MONGO_URI?.trim() ||
  process.env.HUB_MONGODB_URI?.trim() ||
  process.env.MONGODB_URI?.replace(/agentflowhub_landing/i, 'agentflow') ||
  '';

async function main() {
  if (!process.env.MONGODB_URI?.trim()) {
    console.error('Falta MONGODB_URI (base agentflowhub_landing).');
    process.exit(1);
  }
  if (!HUB_MONGO) {
    console.error('No se pudo resolver URI del hub (agentflow).');
    process.exit(1);
  }

  const landing = await createConnection(process.env.MONGODB_URI).asPromise();
  const hub = await createConnection(HUB_MONGO).asPromise();
  const widgets = landing.db.collection('widgets');
  const agents = landing.db.collection('clientagents');

  const wid = Types.ObjectId.isValid(WIDGET_ID) ? new Types.ObjectId(WIDGET_ID) : null;
  const widget = wid ? await widgets.findOne({ _id: wid }) : await widgets.findOne({ _id: WIDGET_ID });
  if (!widget) {
    console.error('Widget no encontrado:', WIDGET_ID);
    process.exit(1);
  }

  const token = widget.afhubToken || widget.publicToken || widget.token || '';
  const agentId = String(widget.agentId || widget.primaryAgentId || '');
  const agent =
    agentId && Types.ObjectId.isValid(agentId)
      ? await agents.findOne({ _id: new Types.ObjectId(agentId) })
      : null;

  let hubAgent = null;
  let catalogDoc = null;
  let ragChunkCount = 0;
  if (agent?.agentHubId) {
    hubAgent = await hub.db.collection('agents').findOne({ id: agent.agentHubId });
    if (agent.model) {
      catalogDoc = await hub.db.collection('model_catalog').findOne({ modelId: agent.model });
    }
    if (hubAgent?.id) {
      ragChunkCount = await hub.db.collection('knowledge_chunks').countDocuments({ agentId: hubAgent.id });
    }
  }

  const report = {
    widget: {
      id: String(widget._id),
      name: widget.name,
      agentId: agentId || null,
      theme: widget.theme,
      position: widget.position,
      color: widget.color,
      active: widget.active ?? widget.status === 'active',
      status: widget.status,
      hasAfhubToken: Boolean(widget.afhubToken),
      tokenPrefix: token ? `${String(token).slice(0, 16)}…` : null,
      multiAgentEnabled: Boolean(widget.multiAgentEnabled),
      allowedOrigins: widget.allowedOrigins ?? null,
    },
    agent: agent
      ? {
          id: String(agent._id),
          name: agent.name,
          model: agent.model,
          agentHubId: agent.agentHubId,
          syncStatus: agent.syncStatus,
          status: agent.status,
          ragEnabled: agent.ragEnabled,
          fallbackModels: agent.fallbackModels ?? [],
          mcpConnections: Array.isArray(agent.mcpConnections) ? agent.mcpConnections.length : 0,
        }
      : null,
    hubAgent: hubAgent
      ? {
          id: hubAgent.id,
          name: hubAgent.name,
          model: hubAgent.model,
          status: hubAgent.status,
          fallbackModels: hubAgent.fallbackModels ?? [],
        }
      : null,
    catalog: catalogDoc
      ? {
          modelId: catalogDoc.modelId,
          enabled: catalogDoc.enabled,
          deprecated: catalogDoc.deprecated,
          replacementModelId: catalogDoc.replacementModelId ?? null,
        }
      : null,
    ragChunks: ragChunkCount,
    modelMatch: agent && hubAgent ? agent.model === hubAgent.model : null,
    mongo: {
      landingDb: landing.name,
      hubDb: hub.name,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  await landing.close();
  await hub.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
