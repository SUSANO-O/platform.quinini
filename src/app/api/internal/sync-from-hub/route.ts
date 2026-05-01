/**
 * POST /api/internal/sync-from-hub
 * Llamada server-to-server desde AIBackHub tras PUT/PATCH de un agente del catálogo.
 * Actualiza ClientAgent (campos base + RAG + jerarquía sub-agentes) por `agentHubId` / `landingClientAgentId`.
 */
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import { repairSubAgentLinks } from '@/lib/repair-subagent-links';

function getSecret(req: NextRequest): string | null {
  return (
    req.headers.get('x-hub-sync-secret')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    null
  );
}

function parseClientAgentIdFromDescription(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const m = description.match(/\[CLIENT-AGENT-ID:([a-f0-9]{24})\]/i);
  return m?.[1];
}

function buildClientFilter(agentHubId: string, landingClientAgentId?: string, description?: string) {
  const hex = /^[a-f0-9]{24}$/i;
  let ca = landingClientAgentId?.trim();
  if (!ca || !hex.test(ca)) {
    ca = parseClientAgentIdFromDescription(description);
  }
  if (ca && hex.test(ca)) {
    try {
      const oid = new mongoose.Types.ObjectId(ca);
      return { _id: oid };
    } catch {
      return { agentHubId };
    }
  }
  return { agentHubId };
}

/** Normaliza `ragSources` del hub al esquema Mongoose de la landing (fechas, límites). */
function normalizeRagSources(raw: unknown): unknown[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, 20).map((item) => {
    if (!item || typeof item !== 'object') return item;
    const o = { ...(item as Record<string, unknown>) };
    const u = o.uploadedAt;
    if (typeof u === 'string' || u instanceof Date) {
      const d = new Date(u);
      o.uploadedAt = !Number.isNaN(d.getTime()) ? d : null;
    }
    if (typeof o.content === 'string' && o.content.length > 120_000) {
      o.content = o.content.slice(0, 120_000);
    }
    return o;
  });
}

export async function POST(req: NextRequest) {
  const expected = process.env.HUB_TO_LANDING_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: 'No configurado.' }, { status: 503 });
  }

  const got = getSecret(req);
  if (!got || got !== expected) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  let body: {
    agentHubId?: string;
    landingClientAgentId?: string;
    landingParentClientAgentId?: string | null;
    catalogAgentType?: 'agent' | 'sub-agent';
    name?: string;
    description?: string;
    prompt?: string;
    model?: string;
    status?: 'active' | 'disabled';
    ragEnabled?: boolean;
    ragSources?: unknown;
    inferenceTemperature?: number | null;
    inferenceMaxTokens?: number | null;
    isPlatform?: boolean;
    skills?: string[];
    enabledToolIds?: string[];
    tools?: Array<{
      toolId: string;
      config?: Record<string, unknown>;
    }>;
    widgetPublicToken?: string | null;
    persistConversationHistory?: boolean;
    skillsConfig?: Array<{
      id: string;
      name?: string;
      enabled?: boolean;
      priority?: number;
      config?: {
        prompt_extension?: string;
        active_tools?: string[];
        llm_settings?: {
          temperature?: number;
          maxOutputTokens?: number;
        };
      };
    }>;
    behaviorRules?: Array<Record<string, unknown>>;
    agentFaqs?: Array<{
      id: string;
      question: string;
      answer: string;
      enabled?: boolean;
      priority?: number;
    }>;
    faqCandidates?: Array<{
      id: string;
      key: string;
      questionSample: string;
      count: number;
      lastSeen: string;
      dismissed?: boolean;
    }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const agentHubId = typeof body.agentHubId === 'string' ? body.agentHubId.trim() : '';
  if (!agentHubId) {
    return NextResponse.json({ error: 'agentHubId requerido.' }, { status: 400 });
  }

  await connectDB();

  const $set: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) $set.name = body.name.trim();
  if (typeof body.description === 'string') $set.description = body.description;
  if (typeof body.prompt === 'string') $set.systemPrompt = body.prompt;
  if (typeof body.model === 'string' && body.model.trim()) $set.model = body.model.trim();
  if (body.status === 'active' || body.status === 'disabled') $set.status = body.status;

  if (typeof body.ragEnabled === 'boolean') {
    $set.ragEnabled = body.ragEnabled;
  }
  if (body.ragSources !== undefined) {
    const norm = normalizeRagSources(body.ragSources);
    if (norm !== undefined) $set.ragSources = norm;
  }
  if (typeof body.inferenceTemperature === 'number') {
    $set.inferenceTemperature = body.inferenceTemperature;
  } else if (body.inferenceTemperature === null) {
    $set.inferenceTemperature = null;
  }
  if (typeof body.inferenceMaxTokens === 'number') {
    $set.inferenceMaxTokens = body.inferenceMaxTokens;
  } else if (body.inferenceMaxTokens === null) {
    $set.inferenceMaxTokens = null;
  }
  // Hub is source of truth for platform visibility.
  if (typeof body.isPlatform === 'boolean') {
    $set.isPlatform = body.isPlatform;
  }

  const hex = /^[a-f0-9]{24}$/i;
  if ('landingParentClientAgentId' in body || body.catalogAgentType) {
    const parent = body.landingParentClientAgentId;
    if (parent === null || body.catalogAgentType === 'agent') {
      $set.type = 'agent';
      $set.parentAgentId = null;
    } else if (typeof parent === 'string' && hex.test(parent)) {
      $set.type = 'sub-agent';
      $set.parentAgentId = parent;
    }
  }

  if (Array.isArray(body.skills)) {
    $set.skills = body.skills
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, 20);
  }
  if (Array.isArray(body.enabledToolIds)) {
    $set.enabledMcpToolIds = body.enabledToolIds
      .filter((x): x is string => typeof x === 'string' && (x.startsWith('mcp:') || x.startsWith('std:')))
      .map((x) => x.trim())
      .slice(0, 200);
  }
  if (Array.isArray(body.tools)) {
    $set.tools = body.tools
      .filter(
        (x): x is { toolId: string; config?: Record<string, unknown> } =>
          Boolean(x) && typeof x === 'object' && typeof x.toolId === 'string' && x.toolId.trim().length > 0,
      )
      .map((x) => {
        const cfg: Record<string, string> = {};
        if (x.config && typeof x.config === 'object') {
          for (const [k, v] of Object.entries(x.config)) {
            if (typeof v === 'string') cfg[k] = v;
            else if (v != null) cfg[k] = String(v);
          }
        }
        return { toolId: x.toolId.trim().slice(0, 80), config: cfg };
      })
      .slice(0, 100);
  }
  if (body.widgetPublicToken === null) {
    $set.widgetPublicToken = null;
  } else if (typeof body.widgetPublicToken === 'string') {
    const t = body.widgetPublicToken.trim().slice(0, 512);
    $set.widgetPublicToken = t || null;
  }
  if (typeof body.persistConversationHistory === 'boolean') {
    $set.persistConversationHistory = body.persistConversationHistory;
  }
  if (Array.isArray(body.skillsConfig)) {
    $set.skillsConfig = body.skillsConfig
      .filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && x.id.trim().length > 0)
      .map((x) => ({
        id: String(x.id).trim().slice(0, 64),
        ...(typeof x.name === 'string' ? { name: x.name.trim().slice(0, 120) } : {}),
        ...(typeof x.enabled === 'boolean' ? { enabled: x.enabled } : {}),
        ...(typeof x.priority === 'number' ? { priority: Math.max(0, Math.min(1000, Math.floor(x.priority))) } : {}),
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
                          ? {
                              temperature: Math.max(0, Math.min(2, x.config.llm_settings.temperature)),
                            }
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
      .slice(0, 50);
  }

  if (Array.isArray(body.behaviorRules)) {
    $set.behaviorRules = body.behaviorRules
      .filter((x) => x && typeof x === 'object')
      .map((x) => x as Record<string, unknown>)
      .slice(0, 80);
  }
  if (Array.isArray(body.agentFaqs)) {
    $set.agentFaqs = body.agentFaqs
      .filter((x) => x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string')
      .map((x) => {
        const o = x as {
          id: string;
          question?: string;
          answer?: string;
          enabled?: boolean;
          priority?: number;
        };
        return {
          id: String(o.id).trim().slice(0, 64),
          question: typeof o.question === 'string' ? o.question.trim().slice(0, 500) : '',
          answer: typeof o.answer === 'string' ? o.answer.trim().slice(0, 8000) : '',
          ...(typeof o.enabled === 'boolean' ? { enabled: o.enabled } : {}),
          ...(typeof o.priority === 'number'
            ? { priority: Math.max(0, Math.min(1000, Math.floor(o.priority))) }
            : {}),
        };
      })
      .filter((x) => x.question.length > 0 && x.answer.length > 0)
      .slice(0, 100);
  }
  if (Array.isArray(body.faqCandidates)) {
    $set.faqCandidates = body.faqCandidates
      .filter((x) => x && typeof x === 'object' && typeof (x as { key?: unknown }).key === 'string')
      .map((x) => {
        const o = x as {
          id?: string;
          key: string;
          questionSample?: string;
          count?: number;
          lastSeen?: string;
          dismissed?: boolean;
        };
        return {
          id: typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 64) : new mongoose.Types.ObjectId().toString(),
          key: String(o.key).trim().slice(0, 500),
          questionSample: typeof o.questionSample === 'string' ? o.questionSample.trim().slice(0, 400) : '',
          count:
            typeof o.count === 'number' && Number.isFinite(o.count)
              ? Math.max(0, Math.min(1_000_000, Math.floor(o.count)))
              : 0,
          lastSeen: typeof o.lastSeen === 'string' ? o.lastSeen.trim().slice(0, 40) : new Date().toISOString(),
          dismissed: o.dismissed === true,
        };
      })
      .slice(0, 50);
  }

  /** El slug del hub es la fuente de verdad para `agentHubId` en la landing. */
  $set.agentHubId = agentHubId;

  const filter = buildClientFilter(agentHubId, body.landingClientAgentId, body.description);
  const r = await ClientAgent.updateMany(filter, { $set });

  if (r.matchedCount > 0) {
    const one = await ClientAgent.findOne(filter).lean();
    if (one?._id) {
      await repairSubAgentLinks(new mongoose.Types.ObjectId(String(one._id)));
    }
  }

  return NextResponse.json({
    ok: true,
    matched: r.matchedCount,
    modified: r.modifiedCount,
  });
}
