/**
 * Configura Asesor de Taller (69d5084c) como admin de departamento de repuestos:
 * prompt, reglas, subtareas, hoja inventarios, tareas programadas, widget.
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, ScheduledTask, Widget } from '@/lib/db/models';
import {
  canAttemptHubSync,
  ensureClientAgentHubSynced,
  syncHubCatalogFromLandingAgentDoc,
} from '@/lib/aibackhub-sync';
import { generateSheetId, sanitizeSheetName, type SheetEntry } from '@/lib/agent-sheets';
import { computeNextRun, DEFAULT_TIMEZONE } from '@/lib/scheduling';
import {
  PROD_TALLER_BEHAVIOR_RULES,
  PROD_TALLER_FAQS,
  PROD_TALLER_NAME,
  PROD_TALLER_SCHEDULED_TASKS,
  PROD_TALLER_SHEET_META,
  PROD_TALLER_SHORTCUTS,
  PROD_TALLER_SUB_AGENTS,
  PROD_TALLER_SUBTITLE,
  PROD_TALLER_SYSTEM_PROMPT,
  PROD_TALLER_WELCOME,
  PROD_TALLER_WIDGET_NAME,
  stripSalesFaqs,
  stripSalesMcpToolIds,
  stripSalesSkills,
  stripSalesSkillsConfig,
} from '@/lib/prod-taller-identity';

export const PROD_WIDGET_ID = '6a03a54c4f69fa7fa9027170';
export const PROD_AGENT_ID = '69d5084c78e0af3d5536fe95';

type ToolRow = {
  toolId?: string;
  config?: { sheets?: SheetEntry[]; [k: string]: unknown };
  [k: string]: unknown;
};

function cloneAgentFields(src: Record<string, unknown>, patch: Record<string, unknown>) {
  const skip = new Set(['_id', 'id', 'createdAt', 'updatedAt', '__v']);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (skip.has(k)) continue;
    out[k] = v;
  }
  return { ...out, ...patch };
}

function ensureInventorySheet(tools: ToolRow[]): ToolRow[] {
  const list = Array.isArray(tools) ? [...tools] : [];
  const idx = list.findIndex((t) => t?.toolId === 'google-sheets');
  if (idx < 0) return list;

  const tool = { ...list[idx] };
  const sheets = Array.isArray(tool.config?.sheets) ? [...tool.config!.sheets!] : [];
  if (!sheets.length) return list;

  const primary = { ...sheets[0] };
  primary.name = sanitizeSheetName(PROD_TALLER_SHEET_META.name);
  primary.description = PROD_TALLER_SHEET_META.description;
  primary.matrixNeed = PROD_TALLER_SHEET_META.matrixNeed;
  if (!primary.id) primary.id = generateSheetId();
  sheets[0] = primary;

  tool.config = { ...(tool.config || {}), sheets };
  list[idx] = tool;
  return list;
}

function parentToolsForSubs(tools: ToolRow[]): ToolRow[] {
  return (Array.isArray(tools) ? tools : []).filter((t) =>
    ['google-sheets', 'webhook', 'slack'].includes(String(t?.toolId || '')),
  );
}

async function upsertSubAgents(params: {
  parentId: string;
  ownerUserId: string;
  parentTools: ToolRow[];
  existingIds: string[];
}): Promise<string[]> {
  const { parentId, ownerUserId, parentTools, existingIds } = params;
  const kept: string[] = [];

  for (let i = 0; i < PROD_TALLER_SUB_AGENTS.length; i++) {
    const spec = PROD_TALLER_SUB_AGENTS[i];
    const existingId = existingIds[i];
    let doc = existingId ? await ClientAgent.findById(existingId) : null;

    // Reusar por nombre si el slot no coincide (p. ej. closer financiero viejo).
    if (!doc) {
      doc = await ClientAgent.findOne({
        userId: ownerUserId,
        name: spec.name,
        type: 'sub-agent',
        parentAgentId: parentId,
      });
    }

    const patch = {
      userId: ownerUserId,
      name: spec.name,
      description: spec.description,
      systemPrompt: spec.systemPrompt,
      type: 'sub-agent' as const,
      parentAgentId: parentId,
      tools: parentTools,
      enabledMcpToolIds: [] as string[],
      hubspotAutoCaptureContacts: false,
      skills: [] as string[],
      skillsConfig: [] as unknown[],
      behaviorRules: [...PROD_TALLER_BEHAVIOR_RULES],
      syncStatus: 'pending' as const,
      status: 'active' as const,
      isPlatform: false,
    };

    if (doc) {
      Object.assign(doc, patch);
      doc.markModified('tools');
      doc.markModified('behaviorRules');
      doc.markModified('skillsConfig');
      doc.markModified('enabledMcpToolIds');
      await doc.save();
      kept.push(String(doc._id));
    } else {
      const parent = await ClientAgent.findById(parentId);
      const created = await ClientAgent.create(
        cloneAgentFields((parent?.toObject() as Record<string, unknown>) || {}, {
          ...patch,
          agentHubId: null,
          widgetPublicToken: null,
          subAgentIds: [],
        }),
      );
      kept.push(String(created._id));
    }
  }

  // Desactivar sub-agentes viejos del padre que ya no están en el equipo.
  const keepSet = new Set(kept);
  for (const oldId of existingIds) {
    if (keepSet.has(oldId)) continue;
    await ClientAgent.updateOne(
      { _id: oldId, parentAgentId: parentId },
      { $set: { status: 'inactive', syncStatus: 'pending' } },
    );
  }

  return kept;
}

async function upsertScheduledTasks(params: {
  agentId: string;
  userId: string;
  widgetId: string;
}): Promise<string[]> {
  const { agentId, userId, widgetId } = params;
  const names: string[] = [];

  for (const spec of PROD_TALLER_SCHEDULED_TASKS) {
    names.push(spec.name);
    const existing = await ScheduledTask.findOne({ agentId, userId, name: spec.name });
    const action = {
      type: 'agent_run' as const,
      config: { prompt: spec.prompt },
    };
    if (existing) {
      existing.enabled = true;
      existing.cron = spec.cron;
      existing.timezone = DEFAULT_TIMEZONE;
      existing.widgetId = widgetId;
      existing.action = action;
      existing.status = 'idle';
      existing.nextRunAt = computeNextRun(spec.cron, DEFAULT_TIMEZONE);
      existing.markModified('action');
      await existing.save();
    } else {
      await ScheduledTask.create({
        agentId,
        userId,
        widgetId,
        name: spec.name,
        enabled: true,
        cron: spec.cron,
        timezone: DEFAULT_TIMEZONE,
        action,
        status: 'idle',
        attempts: 0,
        nextRunAt: computeNextRun(spec.cron, DEFAULT_TIMEZONE),
      });
    }
  }

  // Pausar la tarea genérica vieja si existe.
  await ScheduledTask.updateMany(
    { agentId, userId, name: 'Iniciar agente' },
    { $set: { enabled: false, status: 'paused', nextRunAt: null } },
  );

  return names;
}

export async function ensureProdTallerRepuestos(options?: {
  generatedJsonPath?: string;
}): Promise<{
  agentId: string;
  widgetId: string;
  subAgentIds: string[];
  scheduledTasks: string[];
  hubId: string | null;
  previewPath: string;
}> {
  await connectDB();

  const agent = await ClientAgent.findById(PROD_AGENT_ID);
  const widget = await Widget.findById(PROD_WIDGET_ID);
  if (!agent || !widget) {
    throw new Error('No está el Taller de preview 6a03a54c / 69d5084c.');
  }

  const ownerUserId = String(agent.userId);
  const tools = ensureInventorySheet(
    (Array.isArray(agent.tools) ? agent.tools : []) as ToolRow[],
  );
  const subTools = parentToolsForSubs(tools);

  const existingSubIds = Array.isArray(agent.subAgentIds)
    ? agent.subAgentIds.map(String)
    : [];
  const subAgentIds = await upsertSubAgents({
    parentId: PROD_AGENT_ID,
    ownerUserId,
    parentTools: subTools,
    existingIds: existingSubIds,
  });

  agent.name = PROD_TALLER_NAME;
  agent.description =
    'Administrador del departamento de repuestos: consultas, informes, agotamiento y movimientos de bodega.';
  agent.systemPrompt = PROD_TALLER_SYSTEM_PROMPT;
  agent.tools = tools as typeof agent.tools;
  agent.markModified('tools');
  agent.behaviorRules = [...PROD_TALLER_BEHAVIOR_RULES] as typeof agent.behaviorRules;
  agent.markModified('behaviorRules');
  agent.agentFaqs = PROD_TALLER_FAQS as typeof agent.agentFaqs;
  agent.markModified('agentFaqs');
  agent.skills = stripSalesSkills(agent.skills);
  agent.skillsConfig = stripSalesSkillsConfig(
    (agent.skillsConfig ?? []) as Array<{ id?: string; skillId?: string }>,
  ) as typeof agent.skillsConfig;
  agent.markModified('skillsConfig');
  agent.enabledMcpToolIds = stripSalesMcpToolIds(agent.enabledMcpToolIds as string[] | undefined);
  agent.markModified('enabledMcpToolIds');
  agent.hubspotAutoCaptureContacts = false;
  agent.subAgentIds = subAgentIds;
  agent.markModified('subAgentIds');
  agent.ragEnabled = Boolean(agent.ragEnabled);
  agent.syncStatus = 'pending';
  agent.status = 'active';
  await agent.save();

  widget.name = PROD_TALLER_WIDGET_NAME;
  widget.title = widget.title || 'Carlos';
  widget.subtitle = PROD_TALLER_SUBTITLE;
  widget.welcome = PROD_TALLER_WELCOME;
  widget.fabHint = 'Repuestos';
  widget.shortcuts = PROD_TALLER_SHORTCUTS;
  widget.markModified('shortcuts');
  widget.multiAgentEnabled = true;
  widget.multiAgentMode = 'triage';
  widget.agentId = PROD_AGENT_ID;
  await widget.save();

  const scheduledTasks = await upsertScheduledTasks({
    agentId: PROD_AGENT_ID,
    userId: ownerUserId,
    widgetId: PROD_WIDGET_ID,
  });

  let hubId: string | null =
    typeof agent.agentHubId === 'string' && agent.agentHubId.trim()
      ? agent.agentHubId.trim()
      : null;

  const skipHub = process.env.SKIP_HUB_SYNC === '1';
  if (!skipHub && canAttemptHubSync()) {
    const withTimeout = <T>(p: Promise<T>, ms = 12_000): Promise<T | null> =>
      Promise.race([
        p,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
      ]);

    for (const sid of subAgentIds) {
      await withTimeout(ensureClientAgentHubSynced(sid, ownerUserId).catch(() => null));
    }
    const synced = await withTimeout(ensureClientAgentHubSynced(PROD_AGENT_ID, ownerUserId).catch(() => null));
    if (synced) hubId = synced;
    const fresh = await ClientAgent.findById(PROD_AGENT_ID);
    if (fresh) {
      await withTimeout(syncHubCatalogFromLandingAgentDoc(fresh).catch(() => null));
    }
  }

  const report = {
    agentId: PROD_AGENT_ID,
    widgetId: PROD_WIDGET_ID,
    subAgentIds,
    scheduledTasks,
    hubId,
    previewPath: `/dashboard/widget-preview?id=${PROD_WIDGET_ID}`,
  };

  const jsonPath =
    options?.generatedJsonPath ||
    resolve(process.cwd(), 'scripts/taller-repuestos.generated.json');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  return report;
}
