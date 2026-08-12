/**
 * Snapshot en vivo del agente cuando el usuario está en /dashboard/agents/[id].
 */
import { ClientAgent, ScheduledTask, Widget } from '@/lib/db/models';
import { getAgentLimits } from '@/lib/agent-plans';
import {
  PLAN_DISPLAY,
  getScheduledTaskLimit,
  scheduledTasksEnabled,
} from '@/lib/plan-catalog';

export type AssistAgentDetailSnapshot = {
  agentId: string;
  name: string;
  model: string;
  status: string;
  syncStatus: string;
  strictPurposeOnly: boolean;
  persistConversationHistory: boolean;
  behaviorRulesCount: number;
  faqsCount: number;
  faqCandidatesCount: number;
  enabledMcpToolsCount: number;
  builtInToolsCount: number;
  ragEnabled: boolean;
  ragSourcesCount: number;
  subAgentsCount: number;
  scheduledTasksCount: number;
  skillsCount: number;
  whatsappEnabled: boolean;
  whatsappStatus: string;
  visionEnabled: boolean;
  linkedWidgetsCount: number;
  /** Oportunidades detectadas (interno Math-ais). */
  recommendations: string[];
  plan: string;
  planLimits: {
    subAgentsMax: number;
    toolsMax: number;
    ragSourcesMax: number;
    scheduledTasksAvailable: boolean;
    scheduledTasksMax: number;
  };
};

function planLabel(plan: string): string {
  return PLAN_DISPLAY[plan]?.label || plan;
}

function nextPlanHint(current: string, feature: string): string | null {
  const order = ['free', 'solo', 'team', 'plus', 'business'] as const;
  const idx = order.indexOf(current as (typeof order)[number]);
  if (idx < 0) return null;
  const upgrades: Record<string, Partial<Record<(typeof order)[number], string>>> = {
    subagents: { free: 'Team', solo: 'Team', team: 'Plus' },
    rag: { free: 'Plus', solo: 'Plus', team: 'Plus' },
    whatsapp: { free: 'Plus', solo: 'Plus', team: 'Plus' },
    tasks: { free: 'Plus', solo: 'Plus', team: 'Plus' },
    mcp_plus: { free: 'Plus', solo: 'Plus', team: 'Plus' },
  };
  const map = upgrades[feature];
  if (!map) return null;
  for (let i = idx; i < order.length; i++) {
    const p = order[i];
    if (map[p]) return map[p]!;
  }
  return null;
}

export async function loadAssistAgentDetailSnapshot(
  userId: string,
  agentId: string,
  plan: string,
  subscriptionFeatures?: string[] | null,
): Promise<AssistAgentDetailSnapshot | null> {
  const agent = (await ClientAgent.findOne({ _id: agentId, userId, type: 'agent' })
    .select({
      name: 1,
      model: 1,
      status: 1,
      syncStatus: 1,
      strictPurposeOnly: 1,
      persistConversationHistory: 1,
      behaviorRules: 1,
      agentFaqs: 1,
      faqCandidates: 1,
      enabledMcpToolIds: 1,
      tools: 1,
      ragEnabled: 1,
      ragSources: 1,
      subAgentIds: 1,
      skills: 1,
      whatsapp: 1,
      vision: 1,
    })
    .lean()) as {
    name?: string;
    model?: string;
    status?: string;
    syncStatus?: string;
    strictPurposeOnly?: boolean;
    persistConversationHistory?: boolean;
    behaviorRules?: unknown[];
    agentFaqs?: unknown[];
    faqCandidates?: unknown[];
    enabledMcpToolIds?: string[];
    tools?: unknown[];
    ragEnabled?: boolean;
    ragSources?: unknown[];
    subAgentIds?: string[];
    skills?: string[];
    whatsapp?: { enabled?: boolean; status?: string };
    vision?: { enabled?: boolean };
  } | null;

  if (!agent) return null;

  const limits = getAgentLimits(plan);
  const tasksAvailable = scheduledTasksEnabled(plan, subscriptionFeatures);
  const tasksMax = getScheduledTaskLimit(plan, tasksAvailable);

  const [scheduledTasksCount, linkedWidgetsCount] = await Promise.all([
    ScheduledTask.countDocuments({ userId, agentId }),
    Widget.countDocuments({ userId, agentId, active: { $ne: false } }),
  ]);

  const behaviorRulesCount = Array.isArray(agent.behaviorRules) ? agent.behaviorRules.length : 0;
  const faqsCount = Array.isArray(agent.agentFaqs) ? agent.agentFaqs.length : 0;
  const faqCandidatesCount = Array.isArray(agent.faqCandidates) ? agent.faqCandidates.length : 0;
  const enabledMcpToolsCount = Array.isArray(agent.enabledMcpToolIds)
    ? agent.enabledMcpToolIds.length
    : 0;
  const builtInToolsCount = Array.isArray(agent.tools) ? agent.tools.length : 0;
  const ragSourcesCount = Array.isArray(agent.ragSources) ? agent.ragSources.length : 0;
  const subAgentsCount = Array.isArray(agent.subAgentIds)
    ? agent.subAgentIds.filter(Boolean).length
    : 0;
  const skillsCount = Array.isArray(agent.skills) ? agent.skills.length : 0;
  const whatsappEnabled = agent.whatsapp?.enabled === true;
  const whatsappStatus = String(agent.whatsapp?.status || 'disconnected');
  const visionEnabled = agent.vision?.enabled === true;

  const recommendations: string[] = [];

  if (behaviorRulesCount === 0) {
    recommendations.push('Sin reglas de comportamiento — sugerir pestaña Reglas para tono y políticas.');
  }
  if (faqsCount === 0 && faqCandidatesCount > 0) {
    recommendations.push(
      `Tiene ${faqCandidatesCount} candidata(s) FAQ desde el widget — sugerir convertirlas en FAQ formales.`,
    );
  } else if (faqsCount === 0) {
    recommendations.push('Sin FAQs — sugerir pestaña FAQ para preguntas frecuentes.');
  }
  if (enabledMcpToolsCount === 0 && builtInToolsCount === 0) {
    recommendations.push('Sin herramientas activas — guiar a Herramientas y conectar MCP si necesita integraciones.');
  }
  if (!agent.ragEnabled || ragSourcesCount === 0) {
    if (!limits.ragEnabled) {
      const up = nextPlanHint(plan, 'rag');
      if (up) {
        recommendations.push(
          `Almacenamiento/RAG no incluido en plan ${planLabel(plan)} — mencionar upgrade a ${up} si necesita base de conocimiento.`,
        );
      }
    } else {
      recommendations.push('RAG desactivado o sin fuentes — sugerir pestaña Almacén para subir PDFs/URLs.');
    }
  }
  if (subAgentsCount === 0 && (limits.subAgentsPerAgent < 0 || limits.subAgentsPerAgent > 0)) {
    recommendations.push('Sin sub-agentes — puede delegar tareas especializadas en pestaña Sub-agentes.');
  }
  if (scheduledTasksCount === 0 && tasksAvailable) {
    recommendations.push('Sin tareas programadas — puede automatizar reportes/recordatorios en pestaña Tareas.');
  } else if (scheduledTasksCount === 0 && !tasksAvailable) {
    const up = nextPlanHint(plan, 'tasks');
    if (up) {
      recommendations.push(
        `Tareas programadas desde plan Plus — actualmente en ${planLabel(plan)}; mencionar ${up} si quiere cron/automatización.`,
      );
    }
  }
  if (!whatsappEnabled || whatsappStatus === 'disconnected') {
    const up = nextPlanHint(plan, 'whatsapp');
    if (up && ['free', 'solo', 'team'].includes(plan)) {
      recommendations.push(
        `WhatsApp Business no conectado — canal disponible desde Plus; plan actual ${planLabel(plan)}.`,
      );
    } else {
      recommendations.push('WhatsApp desconectado — guiar pestaña WhatsApp si quiere atender por ese canal.');
    }
  }
  if (linkedWidgetsCount === 0) {
    recommendations.push('Este agente no tiene widget activo — sugerir Widget builder o Mis widgets.');
  }
  if (agent.syncStatus === 'failed') {
    recommendations.push('Sync con hub en error — sugerir revisar Herramientas o reintentar guardar en General.');
  }
  if (faqCandidatesCount >= 3 && faqsCount === 0) {
    recommendations.push('Hay preguntas repetidas en candidatas — priorizar crear FAQs.');
  }

  return {
    agentId,
    name: String(agent.name || 'Agente'),
    model: String(agent.model || 'gemini-2.5-flash'),
    status: String(agent.status || 'active'),
    syncStatus: String(agent.syncStatus || 'pending'),
    strictPurposeOnly: agent.strictPurposeOnly !== false,
    persistConversationHistory: agent.persistConversationHistory !== false,
    behaviorRulesCount,
    faqsCount,
    faqCandidatesCount,
    enabledMcpToolsCount,
    builtInToolsCount,
    ragEnabled: agent.ragEnabled === true,
    ragSourcesCount,
    subAgentsCount,
    scheduledTasksCount,
    skillsCount,
    whatsappEnabled,
    whatsappStatus,
    visionEnabled,
    linkedWidgetsCount,
    recommendations: recommendations.slice(0, 6),
    plan,
    planLimits: {
      subAgentsMax: limits.subAgentsPerAgent,
      toolsMax: limits.toolsPerAgent,
      ragSourcesMax: limits.ragSourcesPerAgent,
      scheduledTasksAvailable: tasksAvailable,
      scheduledTasksMax: tasksMax,
    },
  };
}

export function formatAssistAgentDetailSnapshotBlock(snap: AssistAgentDetailSnapshot): string {
  const lines = [
    '[SNAPSHOT DEL AGENTE EN PANTALLA — datos en vivo; no leer en voz alta]',
    `Agente: «${snap.name}» (id ${snap.agentId})`,
    `Modelo: ${snap.model} · Estado: ${snap.status} · Sync hub: ${snap.syncStatus}`,
    `Solo propósito: ${snap.strictPurposeOnly ? 'sí' : 'no'} · Memoria persistente: ${snap.persistConversationHistory ? 'sí' : 'no'}`,
    `Reglas: ${snap.behaviorRulesCount} · FAQs: ${snap.faqsCount} · Candidatas FAQ: ${snap.faqCandidatesCount}`,
    `Tools MCP activas: ${snap.enabledMcpToolsCount} · Built-in: ${snap.builtInToolsCount} · Skills: ${snap.skillsCount}`,
    `RAG: ${snap.ragEnabled ? 'activo' : 'inactivo'} (${snap.ragSourcesCount} fuente(s)) · Vision: ${snap.visionEnabled ? 'sí' : 'no'}`,
    `Sub-agentes: ${snap.subAgentsCount}/${snap.planLimits.subAgentsMax < 0 ? '∞' : snap.planLimits.subAgentsMax}`,
    `Tareas programadas: ${snap.scheduledTasksCount}${snap.planLimits.scheduledTasksAvailable ? '' : ' (plan sin acceso)'}`,
    `WhatsApp: ${snap.whatsappEnabled ? snap.whatsappStatus : 'no configurado'}`,
    `Widgets vinculados activos: ${snap.linkedWidgetsCount}`,
    `Plan cliente: ${snap.plan} (límite tools/agente: ${snap.planLimits.toolsMax >= 999 ? 'ilimitado' : snap.planLimits.toolsMax})`,
  ];

  if (snap.recommendations.length > 0) {
    lines.push('', '[RECOMENDACIONES PROACTIVAS PARA ESTE AGENTE]');
    for (const r of snap.recommendations) {
      lines.push(`• ${r}`);
    }
  }

  lines.push(
    '',
    'Pestañas disponibles en ficha: General, Reglas, FAQ, Herramientas, Almacén, Sub-agentes, Tareas, WhatsApp.',
    'Guía al usuario con rutas Dashboard → Agentes → [agente] → pestaña. Ofrece upgrade de plan solo si la función no está en su plan.',
  );

  return lines.join('\n');
}
