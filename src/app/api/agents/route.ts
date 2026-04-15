/**
 * GET  /api/agents           — list user's client agents
 * POST /api/agents           — create a new client agent (checks plan limits)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Subscription, ClientAgent, User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { getAgentLimits } from '@/lib/agent-plans';
import mongoose from 'mongoose';
import {
  canAttemptHubSync,
  fetchCatalogAgentFromHub,
  getAibackhubBaseUrl,
  hubCreateHeaders,
  parseCreatedAgentId,
} from '@/lib/aibackhub-sync';
import { repairSubAgentLinks } from '@/lib/repair-subagent-links';
import { ensureHubPlatformAgentsInLanding } from '@/lib/hub-platform-import';

async function getAuth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest) {
  const userId = await getAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();

  // Agentes creados solo en el hub (isPlatform) no tienen ClientAgent hasta importarlos aquí.
  if (canAttemptHubSync()) {
    try {
      await ensureHubPlatformAgentsInLanding({ fallbackOwnerUserId: userId });
    } catch (e) {
      console.warn('[api/agents GET] ensureHubPlatformAgentsInLanding:', e);
    }
  }

  const own = await ClientAgent.find({ userId }).sort({ createdAt: -1 }).lean();
  const ownIds = own.map((a) => a._id);
  const platformExtra = await ClientAgent.find({
    isPlatform: true,
    type: 'agent',
    status: 'active',
    ...(ownIds.length ? { _id: { $nin: ownIds } } : {}),
  })
    .sort({ createdAt: -1 })
    .lean();
  const agents = [...own, ...platformExtra];

  if (!canAttemptHubSync()) {
    return NextResponse.json({ agents });
  }

  const merged = await Promise.all(
    agents.map(async (a) => {
      const hubId = typeof a.agentHubId === 'string' ? a.agentHubId.trim() : '';
      if (!hubId) return a;
      const isPlatform = Boolean((a as { isPlatform?: boolean }).isPlatform);
      const canFetchHub = String(a.userId) === String(userId) || isPlatform;
      if (!canFetchHub) return a;
      const hub = await fetchCatalogAgentFromHub(hubId);
      if (!hub) return a;
      const name = hub.name?.trim() || a.name;
      const description = hub.description != null ? String(hub.description) : a.description ?? '';
      const systemPrompt =
        hub.prompt != null && String(hub.prompt).trim() !== ''
          ? String(hub.prompt).trim()
          : a.systemPrompt;
      const model = hub.model?.trim() || a.model;
      const $set: Record<string, unknown> = { name, description, systemPrompt, model };
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
      $set.syncStatus = 'synced';
      if (!isPlatform) {
        await ClientAgent.updateOne({ _id: a._id }, { $set });
        if ('type' in $set || 'parentAgentId' in $set) {
          await repairSubAgentLinks(new mongoose.Types.ObjectId(String(a._id)));
        }
      }
      return { ...a, ...$set } as typeof a;
    }),
  );

  return NextResponse.json({ agents: merged });
}

export async function POST(req: NextRequest) {
  const userId = await getAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();

  // ── Get user's plan ──────────────────────────────────────────────────────
  const sub = await Subscription.findOne({ userId }).lean() as { plan?: string; status?: string } | null;
  const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
  const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';
  const limits = getAgentLimits(plan);

  const body = await req.json();
  const {
    name,
    description,
    systemPrompt,
    model,
    tools = [],
    type = 'agent',
    parentAgentId,
    ragSources = [],
    inferenceTemperature: bodyInfTemp,
    inferenceMaxTokens: bodyInfMax,
  } = body;

  const user = await User.findById(userId).select({ role: 1 }).lean() as { role?: string } | null;
  const isAdmin = user?.role === 'admin';
  let isPlatform = false;
  if (body.isPlatform === true) {
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Solo administradores pueden crear agentes de plataforma.' },
        { status: 403 },
      );
    }
    if (type !== 'agent') {
      return NextResponse.json(
        { error: 'Los agentes de plataforma deben ser agentes principales (no sub-agentes).' },
        { status: 400 },
      );
    }
    isPlatform = true;
  }
  const rawWt =
    typeof body.widgetPublicToken === 'string' ? body.widgetPublicToken.trim().slice(0, 512) : '';
  const widgetPublicToken = rawWt || null;

  if (!name?.trim()) return NextResponse.json({ error: 'El nombre es requerido.' }, { status: 400 });
  if (!systemPrompt?.trim()) return NextResponse.json({ error: 'El system prompt es requerido.' }, { status: 400 });
  if (!model) return NextResponse.json({ error: 'El modelo es requerido.' }, { status: 400 });

  // ── Enforce limits (los agentes de plataforma no cuentan en el cupo) ─────
  if (type === 'agent' && !isPlatform) {
    const existingCount = await ClientAgent.countDocuments({
      userId,
      type: 'agent',
      $or: [{ isPlatform: false }, { isPlatform: { $exists: false } }],
    });
    if (existingCount >= limits.agents) {
      return NextResponse.json({
        error: `Tu plan ${plan} permite máximo ${limits.agents} agente${limits.agents !== 1 ? 's' : ''}. Suscríbete a un plan superior para crear más.`,
      }, { status: 403 });
    }
  } else if (type === 'sub-agent') {
    if (!parentAgentId) return NextResponse.json({ error: 'parentAgentId requerido para sub-agentes.' }, { status: 400 });
    const parent = await ClientAgent.findOne({ _id: parentAgentId }).lean();
    if (!parent) return NextResponse.json({ error: 'Agente padre no encontrado.' }, { status: 404 });
    if ((parent as { isPlatform?: boolean }).isPlatform) {
      return NextResponse.json(
        { error: 'Los sub-agentes bajo un agente de plataforma solo se gestionan en AgentFlowHub.' },
        { status: 403 },
      );
    }
    if (String(parent.userId) !== String(userId)) {
      return NextResponse.json({ error: 'Agente padre no encontrado.' }, { status: 404 });
    }
    const subCount = await ClientAgent.countDocuments({ userId, type: 'sub-agent', parentAgentId });
    if (subCount >= limits.subAgentsPerAgent) {
      return NextResponse.json({
        error: `Tu plan permite máximo ${limits.subAgentsPerAgent} sub-agente${limits.subAgentsPerAgent !== 1 ? 's' : ''} por agente.`,
      }, { status: 403 });
    }
    if (limits.subAgentsPerAgent === 0) {
      return NextResponse.json({ error: 'Tu plan no incluye sub-agentes. Actualiza tu suscripción.' }, { status: 403 });
    }
  }

  // ── Validate tools ───────────────────────────────────────────────────────
  if (tools.length > limits.toolsPerAgent) {
    return NextResponse.json({
      error: `Tu plan permite máximo ${limits.toolsPerAgent} herramienta${limits.toolsPerAgent !== 1 ? 's' : ''} por agente.`,
    }, { status: 403 });
  }
  for (const t of tools) {
    if (!limits.availableToolIds.includes(t.toolId)) {
      return NextResponse.json({
        error: `La herramienta "${t.toolId}" no está disponible en tu plan ${plan}.`,
      }, { status: 403 });
    }
  }

  // ── Validate ragSources (only text/url allowed at creation, not files) ───
  const safeRagSources = Array.isArray(ragSources)
    ? ragSources
        .filter((s: { type?: string }) => s.type === 'text' || s.type === 'url')
        .slice(0, 20)
        .map((s: { type: string; name?: string; content?: string }) => ({
          type: s.type,
          name: (s.name ?? '').slice(0, 200),
          content: (s.content ?? '').slice(0, 120000),
          charCount: (s.content ?? '').length,
          uploadedAt: new Date(),
        }))
    : [];

  let inferenceTemperature: number | null | undefined;
  if (bodyInfTemp !== undefined && bodyInfTemp !== null && bodyInfTemp !== '') {
    const n = Number(bodyInfTemp);
    if (!Number.isFinite(n) || n < 0 || n > 2) {
      return NextResponse.json({ error: 'inferenceTemperature debe estar entre 0 y 2.' }, { status: 400 });
    }
    inferenceTemperature = n;
  }
  let inferenceMaxTokens: number | null | undefined;
  if (bodyInfMax !== undefined && bodyInfMax !== null && bodyInfMax !== '') {
    const n = parseInt(String(bodyInfMax), 10);
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json({ error: 'inferenceMaxTokens debe ser un entero ≥ 1.' }, { status: 400 });
    }
    inferenceMaxTokens = n;
  }

  // ── Create in MongoDB ────────────────────────────────────────────────────
  const agent = await ClientAgent.create({
    userId,
    name: name.trim(),
    description: description?.trim() ?? '',
    systemPrompt: systemPrompt.trim(),
    model,
    type,
    parentAgentId: type === 'sub-agent' ? parentAgentId : null,
    tools,
    ragEnabled: safeRagSources.length > 0,
    ragSources: safeRagSources,
    ...(widgetPublicToken ? { widgetPublicToken } : {}),
    syncStatus: 'pending',
    ...(isPlatform ? { isPlatform: true } : {}),
    ...(inferenceTemperature !== undefined ? { inferenceTemperature } : {}),
    ...(inferenceMaxTokens !== undefined ? { inferenceMaxTokens } : {}),
  });

  // ── If sub-agent, link to parent ─────────────────────────────────────────
  if (type === 'sub-agent' && parentAgentId) {
    await ClientAgent.updateOne(
      { _id: parentAgentId, userId },
      { $addToSet: { subAgentIds: agent._id.toString() } },
    );
  }

  // ── Attempt sync to AgentFlowHub backend (fire-and-forget) ──────────────
  syncToHub(agent).catch(() => {});

  return NextResponse.json({ agent }, { status: 201 });
}

async function syncToHub(agent: {
  _id: { toString(): string };
  name: string;
  description?: string;
  systemPrompt: string;
  model: string;
  inferenceTemperature?: number | null;
  inferenceMaxTokens?: number | null;
  ragEnabled?: boolean;
  ragSources?: unknown[];
  type?: 'agent' | 'sub-agent';
  parentAgentId?: string | null;
  widgetPublicToken?: string | null;
  isPlatform?: boolean;
}) {
  if (!canAttemptHubSync()) return;

  const agentId = agent._id.toString();
  const baseUrl = getAibackhubBaseUrl();
  try {
    await connectDB();
    const wt = typeof agent.widgetPublicToken === 'string' ? agent.widgetPublicToken.trim() : '';
    const payload: Record<string, unknown> = {
      name: agent.name,
      description: (agent.description ?? '').trim(),
      prompt: agent.systemPrompt,
      model: agent.model,
      hasWidget: Boolean(wt),
      source: 'landing',
      landingClientAgentId: agentId,
      ragEnabled: Boolean(agent.ragEnabled),
      ragSources: Array.isArray(agent.ragSources) ? agent.ragSources : [],
      catalogAgentType: agent.type === 'sub-agent' ? 'sub-agent' : 'agent',
    };
    if (wt) payload.widgetPublicToken = wt;
    if (agent.type === 'sub-agent' && agent.parentAgentId && /^[a-f0-9]{24}$/i.test(agent.parentAgentId)) {
      payload.landingParentClientAgentId = agent.parentAgentId;
    }
    if (agent.isPlatform === true) {
      payload.isPlatform = true;
    }
    if (typeof agent.inferenceTemperature === 'number') {
      payload.inferenceTemperature = agent.inferenceTemperature;
    }
    if (typeof agent.inferenceMaxTokens === 'number') {
      payload.inferenceMaxTokens = agent.inferenceMaxTokens;
    }

    const res = await fetch(`${baseUrl}/api/agents`, {
      method: 'POST',
      headers: hubCreateHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = await res.json();
      const hubId = parseCreatedAgentId(data);
      const update: { syncStatus: 'synced'; agentHubId?: string } = { syncStatus: 'synced' };
      if (hubId) update.agentHubId = hubId;
      await ClientAgent.updateOne({ _id: agentId }, update);
    } else {
      await ClientAgent.updateOne({ _id: agentId }, { syncStatus: 'failed' });
    }
  } catch {
    await ClientAgent.updateOne({ _id: agentId }, { syncStatus: 'failed' }).catch(() => {});
  }
}
