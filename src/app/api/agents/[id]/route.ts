/**
 * GET   /api/agents/[id]   — get single agent
 * PATCH /api/agents/[id]   — update (name, description, prompt, tools, rag, status, sub-agents)
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { Subscription, ClientAgent } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { getAgentLimits } from '@/lib/agent-plans';
import {
  canAttemptHubSync,
  fetchCatalogAgentFromHub,
  syncHubCatalogFromLandingAgentDoc,
} from '@/lib/aibackhub-sync';
import { repairSubAgentLinks } from '@/lib/repair-subagent-links';

type Params = { params: Promise<{ id: string }> };

async function getAuth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest, { params }: Params) {
  const userId = await getAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const isObjectId = mongoose.Types.ObjectId.isValid(id);
  let agent = isObjectId
    ? await ClientAgent.findOne({
        _id: id,
        $or: [{ userId }, { isPlatform: true, status: 'active', type: 'agent' }],
      }).lean()
    : null;

  if (!agent) {
    agent = await ClientAgent.findOne({
      $or: [{ agentHubId: id }, ...(isObjectId ? [] : [{ name: id }])],
      $and: [{ $or: [{ userId }, { isPlatform: true, status: 'active', type: 'agent' }] }],
    }).lean();
  }
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const isPlatformAgent = Boolean((agent as { isPlatform?: boolean }).isPlatform);
  const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
  const canFetchHubCatalog =
    hubId &&
    canAttemptHubSync() &&
    (String(agent.userId) === String(userId) || isPlatformAgent);

  // Catálogo AIBackHub: fusionar en la respuesta para mostrar la verdad actual. En agentes de plataforma no persistimos en Mongo (solo AgentFlowHub edita el catálogo).
  if (canFetchHubCatalog) {
    const hub = await fetchCatalogAgentFromHub(hubId);
    if (hub) {
      const name = hub.name?.trim() || agent.name;
      const description = hub.description != null ? String(hub.description) : agent.description ?? '';
      const systemPrompt =
        hub.prompt != null && String(hub.prompt).trim() !== ''
          ? String(hub.prompt).trim()
          : agent.systemPrompt;
      const model = hub.model?.trim() || agent.model;
      const $set: Record<string, unknown> = { name, description, systemPrompt, model };
      if (typeof hub.inferenceTemperature === 'number') {
        $set.inferenceTemperature = hub.inferenceTemperature;
      }
      if (typeof hub.inferenceMaxTokens === 'number') {
        $set.inferenceMaxTokens = hub.inferenceMaxTokens;
      }
      if (typeof hub.ragEnabled === 'boolean') $set.ragEnabled = hub.ragEnabled;
      if (hub.ragSources !== undefined) $set.ragSources = hub.ragSources;
      const hex = /^[a-f0-9]{24}$/i;
      const parent = hub.landingParentClientAgentId;
      if (parent === null || hub.catalogAgentType === 'agent') {
        $set.type = 'agent';
        $set.parentAgentId = null;
      } else if (typeof parent === 'string' && hex.test(parent)) {
        $set.type = 'sub-agent';
        $set.parentAgentId = parent;
      }
      if (typeof hub.widgetPublicToken === 'string') {
        $set.widgetPublicToken = hub.widgetPublicToken.trim() || null;
      }

      // Hub alcanzable y agente existe en catálogo → alinear estado de sync en Mongo (corrige `failed` obsoleto).
      $set.syncStatus = 'synced';

      if (!isPlatformAgent) {
        const docId = String(agent._id);
        await ClientAgent.updateOne({ _id: docId }, { $set });
        if ('type' in $set || 'parentAgentId' in $set) {
          await repairSubAgentLinks(new mongoose.Types.ObjectId(docId));
        }
      }

      agent = { ...agent, ...$set } as typeof agent;
    }
  }

  // Hydrate sub-agents
  const subAgents = agent.subAgentIds?.length
    ? await ClientAgent.find({
        _id: { $in: agent.subAgentIds },
        $or: [{ userId }, { isPlatform: true }],
      }).lean()
    : [];

  return NextResponse.json({ agent, subAgents });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await getAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const agent = await ClientAgent.findOne({ _id: id });
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  if (agent.isPlatform) {
    return NextResponse.json(
      {
        error:
          'Los agentes de plataforma no se pueden editar desde la landing. Edita la configuración en AgentFlowHub.',
      },
      { status: 403 },
    );
  }
  if (!agent.isPlatform && String(agent.userId) !== String(userId)) {
    return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });
  }

  const body = await req.json();

  // ── Status toggle ────────────────────────────────────────────────────────
  if ('status' in body) {
    if (!['active', 'disabled'].includes(body.status)) {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
    }
    agent.status = body.status;
    await agent.save();
    return NextResponse.json({ agent });
  }

  // ── Tools update ─────────────────────────────────────────────────────────
  if ('tools' in body) {
    const sub = await Subscription.findOne({ userId }).lean() as { plan?: string; status?: string } | null;
    const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
    const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';
    const limits = getAgentLimits(plan);

    if (body.tools.length > limits.toolsPerAgent) {
      return NextResponse.json({
        error: `Tu plan permite máximo ${limits.toolsPerAgent} herramienta${limits.toolsPerAgent !== 1 ? 's' : ''} por agente.`,
      }, { status: 403 });
    }
    for (const t of body.tools) {
      if (!limits.availableToolIds.includes(t.toolId)) {
        return NextResponse.json({
          error: `La herramienta "${t.toolId}" no está disponible en tu plan.`,
        }, { status: 403 });
      }
    }
    agent.tools = body.tools;
  }

  if ('enabledMcpToolIds' in body) {
    const raw = body.enabledMcpToolIds;
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: 'enabledMcpToolIds debe ser un array de strings (ids mcp: o std:).' },
        { status: 400 },
      );
    }
    const cleaned = raw
      .filter(
        (x: unknown): x is string =>
          typeof x === 'string' && (x.startsWith('mcp:') || x.startsWith('std:')),
      )
      .map((x) => x.trim())
      .slice(0, 200);
    agent.set('enabledMcpToolIds', cleaned);
  }

  // ── RAG update ───────────────────────────────────────────────────────────
  if ('ragEnabled' in body) {
    const sub = await Subscription.findOne({ userId }).lean() as { plan?: string; status?: string } | null;
    const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
    const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';
    const limits = getAgentLimits(plan);

    if (body.ragEnabled && !limits.ragEnabled) {
      return NextResponse.json({ error: 'RAG no está disponible en tu plan actual.' }, { status: 403 });
    }
    agent.ragEnabled = body.ragEnabled;
  }

  if ('ragSources' in body) {
    agent.ragSources = body.ragSources;
  }

  // ── General update ───────────────────────────────────────────────────────
  if ('name' in body && body.name?.trim()) agent.name = body.name.trim();
  if ('description' in body) agent.description = body.description ?? '';
  if ('systemPrompt' in body && body.systemPrompt?.trim()) agent.systemPrompt = body.systemPrompt.trim();
  if ('model' in body && body.model) agent.model = body.model;
  if ('inferenceTemperature' in body) {
    const v = body.inferenceTemperature;
    if (v === null || v === '') {
      (agent as { inferenceTemperature?: number | null }).inferenceTemperature = null;
    } else if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 2) {
      (agent as { inferenceTemperature?: number | null }).inferenceTemperature = v;
    }
  }
  if ('inferenceMaxTokens' in body) {
    const v = body.inferenceMaxTokens;
    if (v === null || v === '') {
      (agent as { inferenceMaxTokens?: number | null }).inferenceMaxTokens = null;
    } else if (typeof v === 'number' && Number.isFinite(v) && v >= 1) {
      (agent as { inferenceMaxTokens?: number | null }).inferenceMaxTokens = Math.floor(v);
    }
  }
  if ('widgetPublicToken' in body) {
    const v = body.widgetPublicToken;
    if (v === null || v === '') {
      agent.set('widgetPublicToken', null);
    } else if (typeof v === 'string') {
      const t = v.trim().slice(0, 512);
      agent.set('widgetPublicToken', t || null);
    }
  }

  await agent.save();

  const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
  if (hubId && canAttemptHubSync()) {
    const pushedOk = await syncHubCatalogFromLandingAgentDoc(agent);
    agent.syncStatus = pushedOk ? 'synced' : 'failed';
    await ClientAgent.updateOne({ _id: agent._id }, { syncStatus: agent.syncStatus });
  }

  return NextResponse.json({ agent });
}
