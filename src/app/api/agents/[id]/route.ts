/**
 * GET    /api/agents/[id]   — get single agent
 * PATCH  /api/agents/[id]   — update (name, description, prompt, tools, rag, status, sub-agents)
 * DELETE /api/agents/[id]   — delete agent and related widgets
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { Subscription, ClientAgent, User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { deleteClientAgent } from '@/lib/delete-client-agent';
import { getAgentLimits } from '@/lib/agent-plans';
import {
  canAttemptHubSync,
  fetchCatalogAgentFromHub,
  hubCatalogStatusToLandingStatus,
  syncHubCatalogFromLandingAgentDoc,
} from '@/lib/aibackhub-sync';
import { repairSubAgentLinks } from '@/lib/repair-subagent-links';
import {
  getUserAllowedProviders,
  isProviderAllowed,
  resolveProviderForModelId,
} from '@/lib/model-provider-policy';
import { validateModelForPlan } from '@/lib/model-plan-policy';
import { isSoloChatOnlyPlan, canUseWhatsApp, whatsappUpgradeLabel, WHATSAPP_MIN_PLAN } from '@/lib/plan-catalog';
import { soloAgentPatchBlocked } from '@/lib/solo-plan-limits';
import { validateAgentFallbackModels } from '@/lib/fallback-models-config';
import { MAX_FAQ_ANSWER_SAMPLE } from '@/lib/agent-faq-utils';
import { syncRagSourceEmbeddings, type RagSourceLike } from '@/lib/rag-embeddings-index';
import { encryptSecret, decryptSecret, maskSecret, isEncryptionAvailable } from '@/lib/secret-crypto';
import { generateVerifyToken, getWhatsAppWebhookUrl } from '@/lib/whatsapp';

type Params = { params: Promise<{ id: string }> };

async function getAuth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

type RawWhatsApp = {
  enabled?: boolean;
  phoneNumberId?: string;
  wabaId?: string;
  displayPhone?: string;
  apiVersion?: string;
  accessTokenEnc?: string;
  appSecretEnc?: string;
  verifyToken?: string;
  status?: string;
  lastError?: string;
};

/** Vista de WhatsApp segura para el cliente: nunca expone tokens en claro. */
function publicWhatsApp(w: RawWhatsApp | undefined | null) {
  const cfg = w || {};
  const tokenPlain = cfg.accessTokenEnc ? decryptSecret(cfg.accessTokenEnc) : '';
  return {
    enabled: Boolean(cfg.enabled),
    phoneNumberId: cfg.phoneNumberId || '',
    wabaId: cfg.wabaId || '',
    displayPhone: cfg.displayPhone || '',
    apiVersion: cfg.apiVersion || 'v21.0',
    status: cfg.status || 'disconnected',
    lastError: cfg.lastError || '',
    verifyToken: cfg.verifyToken || '',
    webhookUrl: getWhatsAppWebhookUrl(),
    hasAccessToken: Boolean(cfg.accessTokenEnc),
    hasAppSecret: Boolean(cfg.appSecretEnc),
    accessTokenHint: tokenPlain ? maskSecret(tokenPlain) : '',
  };
}

/** Reemplaza el subdoc whatsapp por su vista pública en el objeto del agente. */
function withSafeWhatsApp<T extends { whatsapp?: unknown }>(agentObj: T): T {
  return { ...agentObj, whatsapp: publicWhatsApp(agentObj.whatsapp as RawWhatsApp) };
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

  // Catálogo AIBackHub: fusionar con Mongo (incl. plataforma: nombre, modelo, `status` alineado al hub, etc.).
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
      if (Array.isArray(hub.tools)) {
        // Mapa de tools que YA están en Mongo (preservar campos complejos como webhooks[])
        const existingTools = Array.isArray((agent as { tools?: Array<{ toolId?: string; config?: Record<string, unknown> }> }).tools)
          ? (agent as { tools: Array<{ toolId?: string; config?: Record<string, unknown> }> }).tools
          : [];
        const existingByToolId = new Map<string, Record<string, unknown>>();
        for (const t of existingTools) {
          if (t?.toolId && t.config && typeof t.config === 'object') {
            existingByToolId.set(t.toolId, t.config);
          }
        }

        $set.tools = hub.tools
          .filter(
            (x): x is { toolId: string; config?: Record<string, unknown> } =>
              Boolean(x) &&
              typeof x === 'object' &&
              typeof x.toolId === 'string' &&
              x.toolId.trim().length > 0,
          )
          .map((x) => {
            const toolId = x.toolId.trim();
            // Preservar config tal cual (Mixed schema acepta cualquier estructura).
            // NO flattenar a strings — el array webhooks[] y otras estructuras complejas se perderían.
            const hubCfg: Record<string, unknown> =
              x.config && typeof x.config === 'object' && !Array.isArray(x.config)
                ? { ...x.config }
                : {};
            // Merge con lo que hay en Mongo: hub gana, pero claves ausentes en hub se preservan de Mongo.
            // Esto cubre el caso de webhooks[] guardados en landing pero no aún en hub.
            const existing = existingByToolId.get(toolId) ?? {};
            const mergedCfg: Record<string, unknown> = { ...existing, ...hubCfg };
            return { toolId, config: mergedCfg };
          })
          .slice(0, 100);
      }
      if (Array.isArray(hub.skills)) {
        $set.skills = hub.skills
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x) => x.trim())
          .slice(0, 20);
      }
      if (Array.isArray(hub.skillsConfig)) {
        $set.skillsConfig = hub.skillsConfig
          .filter(
            (x): x is {
              id: string;
              name?: string;
              enabled?: boolean;
              priority?: number;
              config?: {
                prompt_extension?: string;
                active_tools?: string[];
                llm_settings?: { temperature?: number; maxOutputTokens?: number };
              };
            } =>
              Boolean(x) &&
              typeof x === 'object' &&
              typeof (x as { id?: unknown }).id === 'string' &&
              (x as { id: string }).id.trim().length > 0,
          )
          .slice(0, 50);
      }
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
      if (typeof hub.persistConversationHistory === 'boolean') {
        $set.persistConversationHistory = hub.persistConversationHistory;
      }
      if (typeof hub.strictPurposeOnly === 'boolean') {
        $set.strictPurposeOnly = hub.strictPurposeOnly;
      }
      if (typeof hub.hubspotAutoCaptureContacts === 'boolean') {
        $set.hubspotAutoCaptureContacts = hub.hubspotAutoCaptureContacts;
      }

      if (typeof hub.isPlatform === 'boolean') $set.isPlatform = hub.isPlatform;
      const landingStatusFromHub = hubCatalogStatusToLandingStatus(hub.status);
      const syncStatusFromHub =
        hub.isPlatform === true || (isPlatformAgent && hub.isPlatform !== false);
      if (landingStatusFromHub !== undefined && syncStatusFromHub) {
        $set.status = landingStatusFromHub;
      }

      // Hub alcanzable y agente existe en catálogo → alinear estado de sync en Mongo (corrige `failed` obsoleto).
      $set.syncStatus = 'synced';

      const docId = String(agent._id);
      await ClientAgent.updateOne({ _id: docId }, { $set });
      if ('type' in $set || 'parentAgentId' in $set) {
        await repairSubAgentLinks(new mongoose.Types.ObjectId(docId));
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

  return NextResponse.json({ agent: withSafeWhatsApp(agent as { whatsapp?: unknown }), subAgents });
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

  const subEarly = await Subscription.findOne({ userId }).lean() as { plan?: string; status?: string; features?: string[] } | null;
  const hasActivePlanEarly = subEarly?.status === 'active' || subEarly?.status === 'trialing';
  const planEarly = hasActivePlanEarly ? (subEarly?.plan ?? 'free') : 'free';
  if (isSoloChatOnlyPlan(planEarly) && !('status' in body)) {
    const blocked = soloAgentPatchBlocked(body as Record<string, unknown>);
    if (blocked) {
      return NextResponse.json({ error: blocked, code: 'SOLO_PLAN_LIMIT' }, { status: 403 });
    }
  }

  // ── Status toggle ────────────────────────────────────────────────────────
  if ('status' in body) {
    if (!['active', 'disabled'].includes(body.status)) {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
    }
    agent.status = body.status;
    await agent.save();
    const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
    if (hubId && canAttemptHubSync()) {
      const pushedOk = await syncHubCatalogFromLandingAgentDoc(agent);
      agent.syncStatus = pushedOk ? 'synced' : 'failed';
      await ClientAgent.updateOne({ _id: agent._id }, { syncStatus: agent.syncStatus });
    }
    return NextResponse.json({ agent: withSafeWhatsApp(agent.toObject() as { whatsapp?: unknown }) });
  }

  // ── Tools update ─────────────────────────────────────────────────────────
  if ('tools' in body) {
    const sub = await Subscription.findOne({ userId }).lean() as {
      plan?: string;
      status?: string;
      features?: string[];
    } | null;
    const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
    const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';
    const limits = getAgentLimits(plan);

    const { sheetNightlySyncEnabled } = await import('@/lib/plan-catalog');
    const canSheetSync = sheetNightlySyncEnabled(plan, sub?.features);
    for (const t of body.tools) {
      if (t?.toolId !== 'google-sheets' || !t.config || typeof t.config !== 'object') continue;
      const sheets = (t.config as { sheets?: unknown }).sheets;
      if (!Array.isArray(sheets)) continue;
      for (const s of sheets) {
        if (!s || typeof s !== 'object') continue;
        if (!canSheetSync) (s as { nightlySyncEnabled?: boolean }).nightlySyncEnabled = false;
      }
    }

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
    // Schema.Types.Mixed en `config` requiere markModified para que Mongoose detecte cambios anidados (webhooks[]).
    agent.markModified('tools');
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
      return NextResponse.json({ error: 'Almacenamiento no está disponible en tu plan actual.' }, { status: 403 });
    }
    agent.ragEnabled = body.ragEnabled;
  }

  let prevRagSources: RagSourceLike[] | null = null;
  if ('ragSources' in body) {
    prevRagSources = Array.isArray(agent.ragSources)
      ? (agent.ragSources as RagSourceLike[])
      : [];
    agent.ragSources = body.ragSources;
  }

  // ── General update ───────────────────────────────────────────────────────
  if ('name' in body && body.name?.trim()) agent.name = body.name.trim();
  if ('description' in body) agent.description = body.description ?? '';
  if ('systemPrompt' in body && body.systemPrompt?.trim()) agent.systemPrompt = body.systemPrompt.trim();
  if ('model' in body && body.model) {
    const sub = await Subscription.findOne({ userId }).lean() as { plan?: string; status?: string } | null;
    const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
    const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';

    const modelCheck = await validateModelForPlan(plan, String(body.model));
    if (!modelCheck.ok) {
      return NextResponse.json({ error: modelCheck.error, code: 'MODEL_PLAN_BLOCKED' }, { status: 403 });
    }

    const allowedProviders = await getUserAllowedProviders(userId);
    if (allowedProviders.length) {
      const provider = await resolveProviderForModelId(String(body.model));
      if (!provider || !isProviderAllowed(allowedProviders, provider)) {
        return NextResponse.json(
          {
            error:
              'Ese modelo no está permitido para tu cuenta por política de proveedor.',
          },
          { status: 403 },
        );
      }
    }
    agent.model = body.model;
  }
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
  if ('persistConversationHistory' in body) {
    if (typeof body.persistConversationHistory === 'boolean') {
      agent.set('persistConversationHistory', body.persistConversationHistory);
    } else {
      return NextResponse.json(
        { error: 'persistConversationHistory debe ser boolean.' },
        { status: 400 },
      );
    }
  }
  if ('strictPurposeOnly' in body) {
    if (typeof body.strictPurposeOnly === 'boolean') {
      agent.set('strictPurposeOnly', body.strictPurposeOnly);
    } else {
      return NextResponse.json({ error: 'strictPurposeOnly debe ser boolean.' }, { status: 400 });
    }
  }
  if ('hubspotAutoCaptureContacts' in body) {
    if (typeof body.hubspotAutoCaptureContacts === 'boolean') {
      agent.set('hubspotAutoCaptureContacts', body.hubspotAutoCaptureContacts);
    } else {
      return NextResponse.json(
        { error: 'hubspotAutoCaptureContacts debe ser boolean.' },
        { status: 400 },
      );
    }
  }
  if ('widgetVoiceName' in body) {
    const v = body.widgetVoiceName;
    if (v === null || v === '') {
      agent.set('widgetVoiceName', null);
    } else if (typeof v === 'string') {
      agent.set('widgetVoiceName', v.trim().slice(0, 200) || null);
    }
  }

  if ('skills' in body) {
    const raw = body.skills;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'skills debe ser un array de strings.' }, { status: 400 });
    }
    const cleaned = raw
      .filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, 20);
    agent.set('skills', cleaned);
  }
  if ('skillsConfig' in body) {
    const raw = body.skillsConfig;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'skillsConfig debe ser un array.' }, { status: 400 });
    }
    const cleaned = raw
      .filter((x: unknown): x is {
        id: string;
        name?: string;
        enabled?: boolean;
        priority?: number;
        config?: {
          prompt_extension?: string;
          active_tools?: string[];
          llm_settings?: { temperature?: number; maxOutputTokens?: number };
        };
      } => Boolean(x) && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string')
      .map((x) => ({
        id: x.id.trim().slice(0, 64),
        ...(typeof x.name === 'string' ? { name: x.name.trim().slice(0, 120) } : {}),
        ...(typeof x.enabled === 'boolean' ? { enabled: x.enabled } : {}),
        ...(typeof x.priority === 'number'
          ? { priority: Math.max(0, Math.min(1000, Math.floor(x.priority))) }
          : {}),
        ...(x.config && typeof x.config === 'object'
          ? {
              config: {
                ...(typeof x.config.prompt_extension === 'string'
                  ? { prompt_extension: x.config.prompt_extension.slice(0, 6000) }
                  : {}),
                ...(Array.isArray(x.config.active_tools)
                  ? {
                      active_tools: x.config.active_tools
                        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
                        .map((t) => t.trim().slice(0, 128))
                        .slice(0, 200),
                    }
                  : {}),
                ...(x.config.llm_settings && typeof x.config.llm_settings === 'object'
                  ? {
                      llm_settings: {
                        ...(typeof x.config.llm_settings.temperature === 'number'
                          ? { temperature: Math.max(0, Math.min(2, x.config.llm_settings.temperature)) }
                          : {}),
                        ...(typeof x.config.llm_settings.maxOutputTokens === 'number'
                          ? {
                              maxOutputTokens: Math.max(
                                1,
                                Math.min(32768, Math.floor(x.config.llm_settings.maxOutputTokens)),
                              ),
                            }
                          : {}),
                      },
                    }
                  : {}),
              },
            }
          : {}),
      }))
      .filter((x) => x.id.length > 0)
      .slice(0, 50);
    agent.set('skillsConfig', cleaned);
  }

  if ('behaviorRules' in body) {
    const raw = body.behaviorRules;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'behaviorRules debe ser un array.' }, { status: 400 });
    }
    const cleaned = raw
      .filter((x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
      .map((x) => ({
        id:
          typeof x.id === 'string' && x.id.trim()
            ? x.id.trim().slice(0, 64)
            : new mongoose.Types.ObjectId().toString(),
        title:
          typeof x.title === 'string' && x.title.trim()
            ? x.title.trim().slice(0, 160)
            : 'Regla sin título',
        enabled: x.enabled !== false,
        priority:
          typeof x.priority === 'number' && Number.isFinite(x.priority)
            ? Math.max(0, Math.min(1000, Math.floor(x.priority)))
            : 100,
        category:
          typeof x.category === 'string' && x.category.trim()
            ? x.category.trim().slice(0, 48)
            : 'general',
        tone:
          typeof x.tone === 'string' && x.tone.trim()
            ? x.tone.trim().slice(0, 48)
            : 'profesional',
        shortAnswers: x.shortAnswers === true,
        complaintPolicy:
          typeof x.complaintPolicy === 'string' ? x.complaintPolicy.trim().slice(0, 2000) : '',
        unknownAnswerPolicy:
          typeof x.unknownAnswerPolicy === 'string'
            ? x.unknownAnswerPolicy.trim().slice(0, 2000)
            : '',
        interpretedRule:
          typeof x.interpretedRule === 'string' ? x.interpretedRule.trim().slice(0, 4000) : '',
        notes: typeof x.notes === 'string' ? x.notes.trim().slice(0, 2000) : '',
      }))
      .slice(0, 80);
    agent.set('behaviorRules', cleaned);
  }

  if ('agentFaqs' in body) {
    const raw = body.agentFaqs;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'agentFaqs debe ser un array.' }, { status: 400 });
    }
    const cleaned = raw
      .filter((x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
      .map((x) => ({
        id:
          typeof x.id === 'string' && x.id.trim()
            ? x.id.trim().slice(0, 64)
            : new mongoose.Types.ObjectId().toString(),
        question:
          typeof x.question === 'string' ? x.question.trim().slice(0, 500) : '',
        answer: typeof x.answer === 'string' ? x.answer.trim().slice(0, 8000) : '',
        enabled: x.enabled !== false,
        priority:
          typeof x.priority === 'number' && Number.isFinite(x.priority)
            ? Math.max(0, Math.min(1000, Math.floor(x.priority)))
            : 100,
      }))
      .filter((x) => x.question.length > 0 && x.answer.length > 0)
      .slice(0, 100);
    agent.set('agentFaqs', cleaned);
  }

  if ('faqCandidates' in body) {
    const raw = body.faqCandidates;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'faqCandidates debe ser un array.' }, { status: 400 });
    }
    const cleaned = raw
      .filter((x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
      .map((x) => ({
        id:
          typeof x.id === 'string' && x.id.trim()
            ? x.id.trim().slice(0, 64)
            : new mongoose.Types.ObjectId().toString(),
        key: typeof x.key === 'string' ? x.key.trim().slice(0, 500) : '',
        questionSample:
          typeof x.questionSample === 'string' ? x.questionSample.trim().slice(0, 400) : '',
        /** El borrador que dejó el widget; sin esto, guardar el panel lo borraría. */
        ...(typeof x.answerSample === 'string' && x.answerSample.trim()
          ? { answerSample: x.answerSample.trim().slice(0, MAX_FAQ_ANSWER_SAMPLE) }
          : {}),
        count:
          typeof x.count === 'number' && Number.isFinite(x.count)
            ? Math.max(0, Math.min(1_000_000, Math.floor(x.count)))
            : 0,
        lastSeen:
          typeof x.lastSeen === 'string' && x.lastSeen.trim()
            ? x.lastSeen.trim().slice(0, 40)
            : new Date().toISOString(),
        dismissed: x.dismissed === true,
      }))
      .filter((x) => x.key.length > 0)
      .slice(0, 50);
    agent.set('faqCandidates', cleaned);
  }

  if ('fallbackModels' in body) {
    const raw = body.fallbackModels;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'fallbackModels debe ser un array.' }, { status: 400 });
    }
    const cleaned = raw
      .filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, 3);
    const fbCheck = await validateAgentFallbackModels(cleaned, planEarly);
    if (!fbCheck.ok) {
      return NextResponse.json({ error: fbCheck.error }, { status: 400 });
    }
    agent.set('fallbackModels', cleaned);
  }

  // ── WhatsApp Business (Fase 2): captura de credenciales del cliente ─────────
  if ('whatsapp' in body && body.whatsapp && typeof body.whatsapp === 'object') {
    // Feature de Business+ (o concedida por override / rol admin). Bloqueamos en planes inferiores sin override.
    const requester = await User.findById(userId).select({ role: 1 }).lean() as { role?: string } | null;
    const isAdmin = requester?.role === 'admin';
    if (!isAdmin && !canUseWhatsApp(planEarly, subEarly?.status ?? 'free', subEarly?.features)) {
      return NextResponse.json(
        {
          error: `La integración con WhatsApp está disponible desde el plan ${whatsappUpgradeLabel()}.`,
          code: 'WHATSAPP_REQUIRES_BUSINESS',
          minPlan: WHATSAPP_MIN_PLAN,
          minPlanLabel: whatsappUpgradeLabel(),
        },
        { status: 403 },
      );
    }
    const w = body.whatsapp as Record<string, unknown>;
    if (!agent.get('whatsapp')) agent.set('whatsapp', {});

    if (typeof w.enabled === 'boolean') agent.set('whatsapp.enabled', w.enabled);
    if (typeof w.phoneNumberId === 'string') agent.set('whatsapp.phoneNumberId', w.phoneNumberId.trim().slice(0, 64));
    if (typeof w.wabaId === 'string') agent.set('whatsapp.wabaId', w.wabaId.trim().slice(0, 64));
    if (typeof w.displayPhone === 'string') agent.set('whatsapp.displayPhone', w.displayPhone.trim().slice(0, 32));
    if (typeof w.apiVersion === 'string' && /^v\d+\.\d+$/.test(w.apiVersion.trim())) {
      agent.set('whatsapp.apiVersion', w.apiVersion.trim());
    }

    // Access token (write-only): se ignora el placeholder enmascarado.
    if (typeof w.accessToken === 'string') {
      const t = w.accessToken.trim();
      if (t && !t.startsWith('•')) {
        if (!isEncryptionAvailable()) {
          return NextResponse.json(
            { error: 'Cifrado de secretos no configurado en el servidor (SECRET_ENCRYPTION_KEY).', code: 'ENCRYPTION_NOT_CONFIGURED' },
            { status: 503 },
          );
        }
        agent.set('whatsapp.accessTokenEnc', encryptSecret(t));
      }
    }
    if (w.clearAccessToken === true) agent.set('whatsapp.accessTokenEnc', '');

    // App secret (write-only, opcional): firma del webhook.
    if (typeof w.appSecret === 'string') {
      const s = w.appSecret.trim();
      if (s && !s.startsWith('•')) {
        if (!isEncryptionAvailable()) {
          return NextResponse.json(
            { error: 'Cifrado de secretos no configurado en el servidor (SECRET_ENCRYPTION_KEY).', code: 'ENCRYPTION_NOT_CONFIGURED' },
            { status: 503 },
          );
        }
        agent.set('whatsapp.appSecretEnc', encryptSecret(s));
      }
    }
    if (w.clearAppSecret === true) agent.set('whatsapp.appSecretEnc', '');

    // Verify token: generarlo si falta o si se pide regenerar.
    if (w.regenerateVerifyToken === true || !agent.get('whatsapp.verifyToken')) {
      agent.set('whatsapp.verifyToken', generateVerifyToken());
    }

    // Estado derivado.
    const hasTok = Boolean(agent.get('whatsapp.accessTokenEnc'));
    const pnid = String(agent.get('whatsapp.phoneNumberId') || '');
    const enabled = Boolean(agent.get('whatsapp.enabled'));
    agent.set('whatsapp.status', enabled ? (hasTok && pnid ? 'connected' : 'pending') : 'disconnected');
    agent.markModified('whatsapp');
  }

  // ── Vision update ────────────────────────────────────────────────────────
  if ('vision' in body) {
    const raw = body.vision;
    if (raw === null) {
      agent.set('vision', null);
    } else if (raw && typeof raw === 'object') {
      const visionConfig = {
        enabled: raw.enabled === true,
        model: ['gemini-2.5-flash', 'gemini-2.5-pro', 'claude-vision'].includes(raw.model)
          ? raw.model
          : 'gemini-2.5-flash',
        ragOnImages: raw.ragOnImages !== false,
        autoExtractText: raw.autoExtractText !== false,
        maxImageSize: typeof raw.maxImageSize === 'number' && raw.maxImageSize > 0 ? raw.maxImageSize : 20,
        acceptedFormats: Array.isArray(raw.acceptedFormats) && raw.acceptedFormats.length > 0
          ? raw.acceptedFormats
          : ['jpeg', 'png', 'webp'],
      };
      agent.set('vision', visionConfig);
      agent.markModified('vision');
    }
  }

  await agent.save();

  const hubId = typeof agent.agentHubId === 'string' ? agent.agentHubId.trim() : '';
  if (hubId && canAttemptHubSync()) {
    const pushedOk = await syncHubCatalogFromLandingAgentDoc(agent);
    agent.syncStatus = pushedOk ? 'synced' : 'failed';
    await ClientAgent.updateOne({ _id: agent._id }, { syncStatus: agent.syncStatus });
  }

  /**
   * Texto, URL y duplicar se guardan aquí, no por rag-upload. Sin este paso
   * el panel muestra la fuente y el agente no puede consultarla.
   */
  if (prevRagSources && hubId) {
    const next = Array.isArray(agent.ragSources) ? (agent.ragSources as RagSourceLike[]) : [];
    const sync = await syncRagSourceEmbeddings({
      agentHubId: hubId,
      previous: prevRagSources,
      next,
    });
    if (sync.errors.length) {
      return NextResponse.json({
        agent,
        warning: `Guardado, pero no se indexó para búsqueda: ${sync.errors.join(' | ')}`,
      });
    }
  }

  return NextResponse.json({ agent: withSafeWhatsApp(agent.toObject() as { whatsapp?: unknown }) });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const userId = await getAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  const result = await deleteClientAgent(userId, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    deleted: true,
    widgetsRemoved: result.widgetsRemoved,
    subAgentsRemoved: result.subAgentsRemoved,
  });
}
