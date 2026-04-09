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
