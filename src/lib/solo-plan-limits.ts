import { isSoloChatOnlyPlan } from '@/lib/plan-catalog';

export { isSoloChatOnlyPlan } from '@/lib/plan-catalog';

/** Campos de widget bloqueados en plan Solo (solo chat básico). */
export const SOLO_WIDGET_LOCKED = {
  humanSupportEnabled: false,
  humanSupportPhone: '',
  handoffEnabled: false,
  handoffNotifyMode: 'inbox' as const,
  autoOpen: false,
  voiceEnabled: false,
  imageUploadEnabled: false,
  micEnabled: false,
  multiAgentEnabled: false,
  multiAgentMode: 'triage' as const,
  orchestratorAgentIds: [] as string[],
  pipelineConfig: null,
};

export function applySoloWidgetDefaults<T extends Record<string, unknown>>(
  plan: string,
  payload: T,
): T {
  if (!isSoloChatOnlyPlan(plan)) return payload;
  const agentId =
    typeof payload.agentId === 'string' && payload.agentId.trim()
      ? payload.agentId.trim()
      : undefined;
  return {
    ...payload,
    ...SOLO_WIDGET_LOCKED,
    ...(agentId ? { agentIds: [agentId] } : {}),
  };
}

const SOLO_AGENT_BLOCKED_KEYS = [
  'tools',
  'enabledMcpToolIds',
  'ragEnabled',
  'ragSources',
  'behaviorRules',
  'agentFaqs',
  'faqCandidates',
  'skills',
  'skillsConfig',
] as const;

/** True si el body intenta escribir capacidades avanzadas no permitidas en Solo. */
export function soloAgentPatchBlocked(body: Record<string, unknown>): string | null {
  if ('tools' in body && Array.isArray(body.tools) && body.tools.length > 0) {
    return 'Las herramientas no están incluidas en el plan Solo. Actualiza tu plan.';
  }
  if (
    'enabledMcpToolIds' in body &&
    Array.isArray(body.enabledMcpToolIds) &&
    body.enabledMcpToolIds.length > 0
  ) {
    return 'Las integraciones MCP no están incluidas en el plan Solo.';
  }
  if ('ragEnabled' in body && body.ragEnabled === true) {
    return 'El almacenamiento no está incluido en el plan Solo.';
  }
  if (
    'ragSources' in body &&
    Array.isArray(body.ragSources) &&
    body.ragSources.length > 0
  ) {
    return 'El almacenamiento no está incluido en el plan Solo.';
  }
  for (const key of SOLO_AGENT_BLOCKED_KEYS) {
    if (key in body && (key === 'behaviorRules' || key === 'agentFaqs' || key === 'faqCandidates')) {
      const val = body[key];
      if (Array.isArray(val) && val.length > 0) {
        return 'Reglas, FAQ y sub-agentes no están incluidos en el plan Solo. Solo pestaña General.';
      }
    }
  }
  if ('skills' in body && Array.isArray(body.skills) && body.skills.length > 0) {
    return 'Las skills no están incluidas en el plan Solo.';
  }
  if ('fallbackModels' in body && Array.isArray(body.fallbackModels) && body.fallbackModels.length > 0) {
    return 'Los modelos de respaldo no están incluidos en el plan Solo.';
  }
  return null;
}
