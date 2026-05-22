/**
 * Quick Start: 1–3 PDFs → agente + widget con defaults.
 */

import { randomBytes } from 'crypto';
import { ClientAgent, Widget, Subscription } from '@/lib/db/models';
import { getAgentLimits, isAgentLimitReached, formatAgentLimit } from '@/lib/agent-plans';
import { canAttemptHubSync, ensureClientAgentHubSynced } from '@/lib/aibackhub-sync';
import { ingestRagFileToAgent, RAG_MAX_FILE_SIZE, type RagIngestInput } from '@/lib/rag-file-ingest';

const QUICK_START_MAX_FILES = 3;
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

export type QuickStartResult =
  | {
      ok: true;
      agentId: string;
      widgetId: string;
      afhubToken: string;
      agentName: string;
      widgetName: string;
      filesIngested: number;
      ingestWarnings: string[];
    }
  | { ok: false; error: string; status: number };

function deriveAgentName(files: QuickStartFile[]): string {
  const first = files[0]?.filename?.replace(/\.[^.]+$/, '').trim();
  if (first && first.length >= 2) return `Asistente — ${first.slice(0, 60)}`;
  return 'Asistente Quick Start';
}

export async function runQuickStart(userId: string, files: QuickStartFile[]): Promise<QuickStartResult> {
  if (!files.length) {
    return { ok: false, error: 'Sube al menos un PDF.', status: 400 };
  }
  if (files.length > QUICK_START_MAX_FILES) {
    return { ok: false, error: `Máximo ${QUICK_START_MAX_FILES} archivos en Quick Start.`, status: 400 };
  }

  for (const f of files) {
    if (f.mimeType !== 'application/pdf' && !f.filename.toLowerCase().endsWith('.pdf')) {
      return { ok: false, error: 'Quick Start solo acepta archivos PDF.', status: 415 };
    }
    if (f.size > RAG_MAX_FILE_SIZE) {
      return { ok: false, error: `Cada PDF debe pesar menos de ${RAG_MAX_FILE_SIZE / 1024 / 1024} MB.`, status: 413 };
    }
  }

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

  const agentName = deriveAgentName(files);
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

  const ingestWarnings: string[] = [];
  let filesIngested = 0;

  for (const f of files) {
    const input: RagIngestInput = {
      buffer: f.buffer,
      filename: f.filename,
      mimeType: f.mimeType || 'application/pdf',
      size: f.size,
    };
    const result = await ingestRagFileToAgent(agent, input, limits, { syncHub: false });
    if (!result.ok) {
      await ClientAgent.deleteOne({ _id: agent._id });
      return { ok: false, error: `${f.filename}: ${result.error}`, status: result.status };
    }
    filesIngested += 1;
    if (result.warning) ingestWarnings.push(`${f.filename}: ${result.warning}`);
  }

  if (canAttemptHubSync()) {
    try {
      await ensureClientAgentHubSynced(agent);
    } catch {
      agent.syncStatus = 'failed';
      await agent.save();
    }
  }

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

  return {
    ok: true,
    agentId: agent._id.toString(),
    widgetId: widget._id.toString(),
    afhubToken,
    agentName,
    widgetName,
    filesIngested,
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
