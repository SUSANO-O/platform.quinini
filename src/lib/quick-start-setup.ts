/**
 * Quick Start: 1–3 PDFs → agente + widget con defaults.
 */

import { randomBytes } from 'crypto';
import { ClientAgent, Widget, Subscription } from '@/lib/db/models';
import { getAgentLimits, isAgentLimitReached, formatAgentLimit } from '@/lib/agent-plans';
import { canAttemptHubSync, ensureClientAgentHubSynced } from '@/lib/aibackhub-sync';
import { ingestRagFileToAgent, type RagIngestInput } from '@/lib/rag-file-ingest';

export const QUICK_START_MAX_FILES = 3;
/** Vercel serverless body limit is 4.5 MB; leave headroom for multipart overhead. */
export const QUICK_START_MAX_FILE_SIZE = 4 * 1024 * 1024;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_SYSTEM_PROMPT =
  'Eres un asistente virtual amable y preciso. Responde en el idioma del usuario usando ' +
  'únicamente la información de los documentos proporcionados. Si no sabes algo, dilo con claridad ' +
  'y ofrece contactar con un humano si es necesario.';

export type QuickStartFile = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
};

export type QuickStartSuccess = {
  ok: true;
  agentId: string;
  widgetId: string;
  afhubToken: string;
  agentName: string;
  widgetName: string;
  filesIngested: number;
  ingestWarnings: string[];
};

export type QuickStartResult = QuickStartSuccess | { ok: false; error: string; status: number };

export type QuickStartInitInput = { name: string; size: number };

function deriveAgentNameFromNames(names: string[]): string {
  const first = names[0]?.replace(/\.[^.]+$/, '').trim();
  if (first && first.length >= 2) return `Asistente — ${first.slice(0, 60)}`;
  return 'Asistente Quick Start';
}

function deriveAgentName(files: QuickStartFile[]): string {
  return deriveAgentNameFromNames(files.map((f) => f.filename));
}

function validateQuickStartFileMeta(
  files: QuickStartInitInput[],
): { ok: true } | { ok: false; error: string; status: number } {
  if (!files.length) {
    return { ok: false, error: 'Sube al menos un PDF.', status: 400 };
  }
  if (files.length > QUICK_START_MAX_FILES) {
    return { ok: false, error: `Máximo ${QUICK_START_MAX_FILES} archivos en Quick Start.`, status: 400 };
  }
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      return { ok: false, error: 'Quick Start solo acepta archivos PDF.', status: 415 };
    }
    if (f.size > QUICK_START_MAX_FILE_SIZE) {
      return {
        ok: false,
        error: `Cada PDF debe pesar menos de ${QUICK_START_MAX_FILE_SIZE / 1024 / 1024} MB (límite del servidor).`,
        status: 413,
      };
    }
  }
  return { ok: true };
}

async function assertQuickStartAllowed(
  userId: string,
): Promise<{ ok: true; limits: ReturnType<typeof getAgentLimits> } | { ok: false; error: string; status: number }> {
  const sub = await Subscription.findOne({ userId }).lean() as { plan?: string; status?: string } | null;
  const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
  const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';
  const limits = getAgentLimits(plan);

  if (!limits.ragEnabled) {
    return {
      ok: false,
      error: 'RAG no está disponible en tu plan. Actualiza tu suscripción para usar Quick Start.',
      status: 403,
    };
  }

  const existingCount = await ClientAgent.countDocuments({
    userId,
    type: 'agent',
    $or: [{ isPlatform: false }, { isPlatform: { $exists: false } }],
  });
  if (isAgentLimitReached(existingCount, limits.agents)) {
    return {
      ok: false,
      error: `Tu plan permite máximo ${formatAgentLimit(limits.agents)} agente(s). Libera cupo o mejora tu plan.`,
      status: 403,
    };
  }

  return { ok: true, limits };
}

async function createQuickStartAgentAndWidget(userId: string, agentName: string) {
  const agent = await ClientAgent.create({
    userId,
    name: agentName,
    description: 'Creado con Quick Start',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    model: DEFAULT_MODEL,
    type: 'agent',
    tools: [],
    ragEnabled: false,
    ragSources: [],
    strictPurposeOnly: true,
    syncStatus: 'pending',
  });

  const widgetName = `Widget — ${agentName}`.slice(0, 80);
  const afhubToken = `wt_${randomBytes(24).toString('hex')}`;
  const widget = await Widget.create({
    userId,
    name: widgetName,
    agentId: agent._id.toString(),
    afhubToken,
    color: '#6366f1',
    title: agentName,
    subtitle: 'En línea',
    welcome: 'Hola. Pregúntame lo que necesites sobre la documentación que subiste.',
    position: 'bottom-right',
    theme: 'light',
    borderRadius: 16,
    autoOpen: false,
    voiceEnabled: true,
    active: true,
  });

  return { agent, widget, afhubToken, widgetName };
}

/** Fase 1: crea agente + widget vacíos (sin subir PDFs en el mismo request). */
export async function runQuickStartInit(
  userId: string,
  files: QuickStartInitInput[],
): Promise<
  | {
      ok: true;
      agentId: string;
      widgetId: string;
      afhubToken: string;
      agentName: string;
      widgetName: string;
    }
  | { ok: false; error: string; status: number }
> {
  const meta = validateQuickStartFileMeta(files);
  if (!meta.ok) return meta;

  const allowed = await assertQuickStartAllowed(userId);
  if (!allowed.ok) return allowed;

  const agentName = deriveAgentNameFromNames(files.map((f) => f.name));
  const { agent, widget, afhubToken, widgetName } = await createQuickStartAgentAndWidget(userId, agentName);

  return {
    ok: true,
    agentId: agent._id.toString(),
    widgetId: widget._id.toString(),
    afhubToken,
    agentName,
    widgetName,
  };
}

/** Fase 3: sincroniza hub tras subir PDFs uno a uno. */
export async function runQuickStartFinalize(
  userId: string,
  agentId: string,
): Promise<
  | { ok: true; agentId: string; filesIngested: number }
  | { ok: false; error: string; status: number }
> {
  const agent = await ClientAgent.findOne({ _id: agentId, userId });
  if (!agent) return { ok: false, error: 'Agente no encontrado.', status: 404 };

  const filesIngested = agent.ragSources?.length ?? 0;
  if (!filesIngested) {
    await ClientAgent.deleteOne({ _id: agent._id });
    await Widget.deleteMany({ agentId: agent._id.toString(), userId });
    return { ok: false, error: 'No se indexó ningún PDF. Intenta de nuevo.', status: 400 };
  }

  if (canAttemptHubSync()) {
    try {
      await ensureClientAgentHubSynced(agent);
    } catch {
      agent.syncStatus = 'failed';
      await agent.save();
    }
  }

  return { ok: true, agentId: agent._id.toString(), filesIngested };
}

/** Flujo legacy: un solo PDF en el mismo request (≤ 4 MB). */
export async function runQuickStart(userId: string, files: QuickStartFile[]): Promise<QuickStartResult> {
  const meta = validateQuickStartFileMeta(
    files.map((f) => ({ name: f.filename, size: f.size })),
  );
  if (!meta.ok) return meta;
  if (files.length > 1) {
    return {
      ok: false,
      error: 'Sube los PDFs uno a uno o usa el flujo Quick Start desde el dashboard.',
      status: 400,
    };
  }

  const f = files[0];
  if (f.mimeType !== 'application/pdf' && !f.filename.toLowerCase().endsWith('.pdf')) {
    return { ok: false, error: 'Quick Start solo acepta archivos PDF.', status: 415 };
  }
  if (f.size > QUICK_START_MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `Cada PDF debe pesar menos de ${QUICK_START_MAX_FILE_SIZE / 1024 / 1024} MB (límite del servidor).`,
      status: 413,
    };
  }

  const allowed = await assertQuickStartAllowed(userId);
  if (!allowed.ok) return allowed;

  const agentName = deriveAgentName(files);
  const { agent, widget, afhubToken, widgetName } = await createQuickStartAgentAndWidget(userId, agentName);

  const ingestWarnings: string[] = [];
  const input: RagIngestInput = {
    buffer: f.buffer,
    filename: f.filename,
    mimeType: f.mimeType || 'application/pdf',
    size: f.size,
  };
  const result = await ingestRagFileToAgent(agent, input, allowed.limits, { syncHub: false });
  if (!result.ok) {
    await ClientAgent.deleteOne({ _id: agent._id });
    await Widget.deleteOne({ _id: widget._id });
    return { ok: false, error: `${f.filename}: ${result.error}`, status: result.status };
  }
  if (result.warning) ingestWarnings.push(`${f.filename}: ${result.warning}`);

  const finalized = await runQuickStartFinalize(userId, agent._id.toString());
  if (!finalized.ok) return finalized;

  return {
    ok: true,
    agentId: agent._id.toString(),
    widgetId: widget._id.toString(),
    afhubToken,
    agentName,
    widgetName,
    filesIngested: finalized.filesIngested,
    ingestWarnings,
  };
}

export function buildEmbedSnippet(origin: string, token: string): string {
  const host = origin.replace(/\/$/, '');
  return [
    `<script src="${host}/widget.js"></script>`,
    `<script>`,
    `  window.AgentFlowhub.init({`,
    `    token: '${token}',`,
    `    host:  '${host}',`,
    `  });`,
    `</script>`,
  ].join('\n');
}
