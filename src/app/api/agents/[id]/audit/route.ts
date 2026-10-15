/**
 * Auditor de agentes (Gemini 4 Argon) — Team+.
 *   POST /api/agents/[id]/audit  → lanza una auditoría en segundo plano (202 { auditId })
 *   GET  /api/agents/[id]/audit  → última auditoría del agente (running | done | error) + acceso
 *   PATCH /api/agents/[id]/audit → aplica una propuesta concreta (ver abajo)
 *
 * El informe son propuestas: solo PATCH cambia el agente, una propuesta cada vez.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import mongoose from 'mongoose';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { AgentAudit, ClientAgent, Subscription, WidgetMessage } from '@/lib/db/models';
import { canUseAgentAudit, AGENT_AUDIT_MIN_PLAN, PLAN_DISPLAY } from '@/lib/plan-catalog';
import { canAttemptHubSync, hubCreateHeaders, hubFetch, syncHubCatalogFromLandingAgentDoc } from '@/lib/aibackhub-sync';
import {
  AUDIT_MESSAGE_SCAN_LIMIT,
  AUDIT_WINDOW_DAYS,
  buildAgentAuditBody,
  type AuditAgentDoc,
  type AuditMessageRow,
} from '@/lib/agent-audit-input';
import { baseSystemPrompt, mergeSystemPromptWithManagedBlocks, normalizeBehaviorRule } from '@/lib/agent-managed-prompt';
import type { AgentFaqRow, FaqCandidateRow } from '@/lib/agent-faq-utils';

export const maxDuration = 300;

/** Una auditoría "running" más vieja que esto se da por muerta (la función se cortó). */
const STALE_RUNNING_MS = 6 * 60_000;
const DAILY_LIMIT_PER_AGENT = 10;

function auth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  return token ? verifySessionToken(token) : null;
}

async function auditAccess(userId: string) {
  const sub = (await Subscription.findOne({ userId }).select({ plan: 1, status: 1, features: 1 }).lean()) as
    | { plan?: string; status?: string; features?: string[] }
    | null;
  return {
    hasAccess: canUseAgentAudit(sub?.plan ?? 'free', sub?.status ?? 'free', sub?.features),
    minPlanLabel: PLAN_DISPLAY[AGENT_AUDIT_MIN_PLAN]?.label ?? 'Team',
  };
}

async function loadAgent(id: string, userId: string) {
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  return (await ClientAgent.findOne({ _id: id, userId })
    .select({
      name: 1, description: 1, systemPrompt: 1, model: 1, agentFaqs: 1, behaviorRules: 1,
      skills: 1, enabledMcpToolIds: 1, 'ragSources.name': 1, 'ragSources.fileName': 1,
      agentHubId: 1, updatedAt: 1,
    })
    .lean()) as (AuditAgentDoc & { _id: unknown; agentHubId?: string }) | null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const { id } = await params;
  await connectDB();
  if (!(await loadAgent(id, userId))) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const audit = await AgentAudit.findOne({ agentId: id, userId }).sort({ createdAt: -1 }).lean() as
    | { _id: unknown; status: string; createdAt: Date; [k: string]: unknown }
    | null;
  if (audit?.status === 'running' && Date.now() - new Date(audit.createdAt).getTime() > STALE_RUNNING_MS) {
    await AgentAudit.updateOne({ _id: audit._id, status: 'running' }, { $set: { status: 'error', error: 'La auditoría tardó demasiado. Intenta de nuevo.', finishedAt: new Date() } });
    audit.status = 'error';
    audit.error = 'La auditoría tardó demasiado. Intenta de nuevo.';
  }
  return NextResponse.json({ audit: audit ? { ...audit, id: String(audit._id) } : null, access: await auditAccess(userId) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const { id } = await params;
  await connectDB();

  const access = await auditAccess(userId);
  if (!access.hasAccess) {
    return NextResponse.json(
      { error: `El auditor de agentes está disponible desde el plan ${access.minPlanLabel}.`, code: 'PLAN_REQUIRED', minPlan: AGENT_AUDIT_MIN_PLAN },
      { status: 403 },
    );
  }

  const agent = await loadAgent(id, userId);
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const running = await AgentAudit.findOne({
    agentId: id, status: 'running', createdAt: { $gte: new Date(Date.now() - STALE_RUNNING_MS) },
  }).select({ _id: 1 }).lean() as { _id: unknown } | null;
  if (running) return NextResponse.json({ auditId: String(running._id), status: 'running' }, { status: 202 });

  const today = await AgentAudit.countDocuments({ agentId: id, createdAt: { $gte: new Date(Date.now() - 86_400_000) } });
  if (today >= DAILY_LIMIT_PER_AGENT) {
    return NextResponse.json({ error: `Máximo ${DAILY_LIMIT_PER_AGENT} auditorías por agente al día.` }, { status: 429 });
  }

  const agentIds = [id, agent.agentHubId].filter((x): x is string => typeof x === 'string' && x.length > 0);
  const rows = (await WidgetMessage.find({
    agentId: { $in: agentIds },
    deleted: { $ne: true },
    createdAt: { $gte: new Date(Date.now() - AUDIT_WINDOW_DAYS * 86_400_000) },
  })
    .sort({ createdAt: -1 })
    .limit(AUDIT_MESSAGE_SCAN_LIMIT)
    .select({ sessionId: 1, role: 1, content: 1, createdAt: 1 })
    .lean()) as AuditMessageRow[];

  const body = buildAgentAuditBody(agent, rows);
  const audit = await AgentAudit.create({ agentId: id, userId, status: 'running', conversationsCount: body.conversations.length });
  const auditId = String(audit._id);

  after(async () => {
    try {
      const resp = await hubFetch(
        '/api/ai-assist/audit-agent',
        { method: 'POST', headers: hubCreateHeaders(), body: JSON.stringify(body) },
        240_000,
      );
      const json = (await resp.json().catch(() => null)) as
        | { success?: boolean; data?: { report?: unknown; model?: string; latencyMs?: number }; error?: { message?: string } | string }
        | null;
      if (!resp.ok || !json?.success || !json.data?.report) {
        const msg = typeof json?.error === 'string' ? json.error : json?.error?.message;
        throw new Error(msg || `El auditor respondió ${resp.status}.`);
      }
      await AgentAudit.updateOne(
        { _id: audit._id },
        { $set: { status: 'done', report: json.data.report, model: json.data.model ?? '', latencyMs: json.data.latencyMs ?? 0, finishedAt: new Date() } },
      );
    } catch (err) {
      console.warn('[agent-audit] falló', auditId, err);
      await AgentAudit.updateOne(
        { _id: audit._id },
        { $set: { status: 'error', error: 'No se pudo completar la auditoría. Intenta de nuevo en unos minutos.', finishedAt: new Date() } },
      ).catch(() => {});
    }
  });

  return NextResponse.json({ auditId, status: 'running', conversations: body.conversations.length }, { status: 202 });
}

type AppliedEntry = { kind: string; index: number; at: Date; previousPrompt?: string; undone?: boolean };
type StoredReport = {
  suggestedFaqs?: Array<{ question: string; answer: string }>;
  suggestedRules?: Array<{ title: string; description: string }>;
  toolChanges?: Array<{ toolId: string; action: 'quitar' | 'añadir' }>;
  proposedSystemPrompt?: string | null;
};

/**
 * PATCH /api/agents/[id]/audit — aplica UNA propuesta del informe (el dueño decide cada una).
 *   { auditId, kind: 'faq'|'rule'|'tool'|'prompt', index, question?, answer?, title?, description?, prompt? }
 *   { auditId, kind: 'undo_prompt' } → restaura el prompt anterior a la propuesta aplicada.
 * Los campos opcionales permiten aplicar la propuesta editada desde la pantalla.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = typeof body?.kind === 'string' ? body.kind : '';
  const index = typeof body?.index === 'number' ? body.index : -1;
  const auditId = typeof body?.auditId === 'string' && /^[a-f0-9]{24}$/i.test(body.auditId) ? body.auditId : '';
  const text = (k: string, max: number) => (typeof body?.[k] === 'string' ? (body[k] as string).trim().slice(0, max) : '');
  if (!auditId || !['faq', 'rule', 'tool', 'prompt', 'undo_prompt'].includes(kind)) {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  await connectDB();
  if (!(await auditAccess(userId)).hasAccess) {
    return NextResponse.json({ error: 'El auditor de agentes requiere un plan superior.', code: 'PLAN_REQUIRED' }, { status: 403 });
  }
  const audit = (await AgentAudit.findOne({ _id: auditId, agentId: id, userId, status: 'done' }).lean()) as
    | { _id: unknown; report?: StoredReport; applied?: AppliedEntry[] }
    | null;
  if (!audit?.report) return NextResponse.json({ error: 'Auditoría no encontrada.' }, { status: 404 });
  const agent = (await ClientAgent.findOne({ _id: id, userId })
    .select({ systemPrompt: 1, agentFaqs: 1, behaviorRules: 1, faqCandidates: 1, enabledMcpToolIds: 1 })
    .lean()) as {
    systemPrompt?: string;
    agentFaqs?: AgentFaqRow[];
    behaviorRules?: Array<Record<string, unknown>>;
    faqCandidates?: FaqCandidateRow[];
    enabledMcpToolIds?: string[];
  } | null;
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const applied = audit.applied ?? [];
  if (kind !== 'undo_prompt' && applied.some((a) => a.kind === kind && a.index === index && !a.undone)) {
    return NextResponse.json({ error: 'Esta propuesta ya se aplicó.' }, { status: 409 });
  }
  const r = audit.report;
  let agentSet: Record<string, unknown> = {};
  let entry: AppliedEntry = { kind, index, at: new Date() };

  if (kind === 'faq') {
    const s = r.suggestedFaqs?.[index];
    if (!s) return NextResponse.json({ error: 'Propuesta no encontrada.' }, { status: 404 });
    const question = text('question', 1000) || s.question;
    const answer = text('answer', 4000) || s.answer;
    if (/\[COMPLETAR/i.test(`${question} ${answer}`)) {
      return NextResponse.json({ error: 'Completa los datos marcados con [COMPLETAR] antes de añadir la FAQ.' }, { status: 400 });
    }
    agentSet = {
      agentFaqs: [...(agent.agentFaqs ?? []), { id: new mongoose.Types.ObjectId().toString(), question, answer, enabled: true, priority: 0 }],
    };
  } else if (kind === 'rule') {
    const s = r.suggestedRules?.[index];
    if (!s) return NextResponse.json({ error: 'Propuesta no encontrada.' }, { status: 404 });
    const rules = agent.behaviorRules ?? [];
    agentSet = {
      behaviorRules: [
        ...rules,
        {
          id: `rule_audit_${Date.now()}`,
          title: text('title', 300) || s.title,
          interpretedRule: text('description', 2000) || s.description,
          enabled: true,
          priority: rules.length * 10,
        },
      ],
    };
  } else if (kind === 'tool') {
    const s = r.toolChanges?.[index];
    if (!s) return NextResponse.json({ error: 'Propuesta no encontrada.' }, { status: 404 });
    if (s.action !== 'quitar') return NextResponse.json({ error: 'Añade esta herramienta desde la pestaña Herramientas.' }, { status: 400 });
    agentSet = { enabledMcpToolIds: (agent.enabledMcpToolIds ?? []).filter((t) => t !== s.toolId) };
  } else if (kind === 'prompt') {
    const proposed = text('prompt', 60_000) || r.proposedSystemPrompt?.trim() || '';
    if (!proposed) return NextResponse.json({ error: 'No hay prompt propuesto.' }, { status: 404 });
    if (/\[COMPLETAR/i.test(proposed)) {
      return NextResponse.json({ error: 'Completa los datos marcados con [COMPLETAR] antes de usar el prompt.' }, { status: 400 });
    }
    entry = { ...entry, index: 0, previousPrompt: baseSystemPrompt(agent.systemPrompt ?? '') };
    agentSet = { systemPrompt: proposed };
  } else {
    const last = [...applied].reverse().find((a) => a.kind === 'prompt' && !a.undone);
    if (!last || typeof last.previousPrompt !== 'string') {
      return NextResponse.json({ error: 'No hay un prompt aplicado que deshacer.' }, { status: 404 });
    }
    agentSet = { systemPrompt: last.previousPrompt };
    await AgentAudit.updateOne(
      { _id: audit._id },
      { $set: { 'applied.$[e].undone': true } },
      { arrayFilters: [{ 'e.kind': 'prompt', 'e.undone': { $ne: true } }] },
    );
  }

  // El prompt guardado = base + bloques de reglas y FAQ: se reconstruye igual que en el editor.
  const nextFaqs = (agentSet.agentFaqs as AgentFaqRow[] | undefined) ?? agent.agentFaqs ?? [];
  const nextRules = ((agentSet.behaviorRules as Array<Record<string, unknown>> | undefined) ?? agent.behaviorRules ?? [])
    .map((r, i) => normalizeBehaviorRule(r, i));
  const nextBase = baseSystemPrompt(typeof agentSet.systemPrompt === 'string' ? agentSet.systemPrompt : agent.systemPrompt ?? '');
  if (kind !== 'tool') {
    agentSet.systemPrompt = mergeSystemPromptWithManagedBlocks(nextBase, nextRules, nextFaqs, agent.faqCandidates ?? []);
  }

  await ClientAgent.updateOne({ _id: id, userId }, { $set: agentSet });
  if (kind !== 'undo_prompt') await AgentAudit.updateOne({ _id: audit._id }, { $push: { applied: entry } });

  if (canAttemptHubSync()) {
    after(async () => {
      const fresh = await ClientAgent.findOne({ _id: id, userId }).lean();
      if (fresh) {
        await syncHubCatalogFromLandingAgentDoc(fresh as Parameters<typeof syncHubCatalogFromLandingAgentDoc>[0]).catch(() => {});
      }
    });
  }
  return NextResponse.json({ ok: true, kind, index });
}
