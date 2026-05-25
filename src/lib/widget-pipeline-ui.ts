/**
 * Pipeline contenido→creativo — tipos, validación UI y reglas de activación.
 * Client-safe (sin Mongoose).
 */

export const PIPELINE_CONTENT_KEYS = [
  'producto',
  'catálogo',
  'catalogo',
  'precio',
  'venta',
  'información',
  'informacion',
  'datos',
  'auto',
  'vehículo',
  'vehiculo',
  'familia',
  'modelo',
  'plan',
  'ficha',
  'especific',
] as const;

export const PIPELINE_CREATIVE_KEYS = [
  'banner',
  'imagen',
  'image',
  'genera',
  'diseño',
  'diseno',
  'creativ',
  'logo',
  'thumbnail',
  'gráfico',
  'grafico',
  'portada',
  'flyer',
  'post',
  'px',
  'editar',
  'foto',
] as const;

export type PipelineStepRole = 'content' | 'creative';
export type PipelineTriggerMode = 'mixed' | 'always' | 'keywords';

export type PipelineStepConfig = {
  id: string;
  role: PipelineStepRole;
  agentId: string;
  label?: string;
};

export type PipelineConfig = {
  steps: PipelineStepConfig[];
  trigger: {
    mode: PipelineTriggerMode;
    contentKeywords?: string[];
    creativeKeywords?: string[];
  };
};

export type PipelineAgentProfile = {
  name?: string;
  description?: string;
  model?: string;
  enabledMcpToolIds?: string[];
};

export type PipelineAgentOption = {
  id: string;
  name: string;
  profile: PipelineAgentProfile;
};

export type PipelineTemplate = {
  id: string;
  name: string;
  description: string;
  steps: Array<{ role: PipelineStepRole; label: string }>;
  trigger: PipelineConfig['trigger'];
};

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: 'catalog-banner',
    name: 'Catálogo → Banner',
    description: 'Brief de producto y entrega visual (banner o imagen)',
    steps: [
      { role: 'content', label: 'Contenido y catálogo' },
      { role: 'creative', label: 'Diseño e imagen' },
    ],
    trigger: { mode: 'mixed' },
  },
  {
    id: 'sales-creative',
    name: 'Ventas → Creativo',
    description: 'Copy comercial y pieza gráfica en un solo mensaje',
    steps: [
      { role: 'content', label: 'Ventas y propuesta' },
      { role: 'creative', label: 'Pieza creativa' },
    ],
    trigger: { mode: 'mixed' },
  },
  {
    id: 'always-run',
    name: 'Siempre en cadena',
    description: 'Ejecuta el pipeline en cada mensaje (sin filtro de palabras)',
    steps: [
      { role: 'content', label: 'Paso 1 — contenido' },
      { role: 'creative', label: 'Paso 2 — creativo' },
    ],
    trigger: { mode: 'always' },
  },
];

const AGENT_CREATIVE_PROFILE_RE =
  /imagen|banner|creativ|diseño|diseno|visual|graphic|logo|ilustr|photo|foto|arte gráf|art gráf|midjourney|dall·e|dalle|stable diffusion|flux/i;

const AGENT_CONTENT_PROFILE_RE =
  /venta|vendedor|producto|catálogo|catalogo|finanz|soporte|consultor|inversi|cotiz|precio|rag|ficha técnica|ficha tecnica|autos|vehículo|vehiculo/i;

export function newPipelineStepId(): string {
  return `ps_${Math.random().toString(36).slice(2, 10)}`;
}

/** Modelo configurado para generación de imagen (misma heurística que widget-chat-direct-mcp). */
export function isImageGenerationModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  if (!m) return false;
  if (
    m.startsWith('hf/') &&
    (m.includes('stable-diffusion') || m.includes('flux') || m.includes('image-gen'))
  ) {
    return true;
  }
  if (m.startsWith('vx/') && (m.includes('image') || m.includes('nano-banana'))) return true;
  return false;
}

export function isCreativeCapableAgent(agent: PipelineAgentProfile): boolean {
  if (isImageGenerationModel(agent.model ?? '')) return true;
  const text = `${agent.name ?? ''} ${agent.description ?? ''}`.toLowerCase();
  if (AGENT_CREATIVE_PROFILE_RE.test(text)) return true;
  if (PIPELINE_CREATIVE_KEYS.some((k) => text.includes(k))) return true;
  const tools = agent.enabledMcpToolIds ?? [];
  return tools.some((t) => /image|banner|dall|flux|diffusion|text-to-image|generat.*img/i.test(t));
}

export function isContentCapableAgent(agent: PipelineAgentProfile): boolean {
  const text = `${agent.name ?? ''} ${agent.description ?? ''}`.toLowerCase();
  if (AGENT_CONTENT_PROFILE_RE.test(text)) return true;
  return PIPELINE_CONTENT_KEYS.some((k) => text.includes(k));
}

export function pipelineRoleLabel(role: PipelineStepRole): string {
  return role === 'content' ? 'Contenido' : 'Creativo';
}

export function pipelineRoleHint(role: PipelineStepRole): string {
  return role === 'content'
    ? 'Catálogo, almacenamiento, datos de producto'
    : 'Banner, imagen o diseño visual';
}

function normalizeKeywordList(raw: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const cleaned = raw
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 40);
  return cleaned.length ? cleaned : [...fallback];
}

function normalizeStepRole(v: unknown): PipelineStepRole | null {
  return v === 'content' || v === 'creative' ? v : null;
}

function normalizeTriggerMode(v: unknown): PipelineTriggerMode {
  if (v === 'always' || v === 'keywords' || v === 'mixed') return v;
  return 'mixed';
}

/** Normaliza JSON persistido en Mongo. */
export function normalizePipelineConfig(
  raw: unknown,
  orchestratorIds: string[],
): PipelineConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const allowed = new Set(orchestratorIds.filter((id) => /^[a-f0-9]{24}$/i.test(id)));
  if (allowed.size < 2) return null;

  const stepsRaw = Array.isArray(obj.steps) ? obj.steps : [];
  const steps: PipelineStepConfig[] = [];
  for (const item of stepsRaw.slice(0, 2)) {
    if (!item || typeof item !== 'object') continue;
    const step = item as Record<string, unknown>;
    const role = normalizeStepRole(step.role);
    const agentId = typeof step.agentId === 'string' ? step.agentId.trim() : '';
    if (!role || !allowed.has(agentId)) continue;
    steps.push({
      id: typeof step.id === 'string' && step.id.trim() ? step.id.trim().slice(0, 64) : newPipelineStepId(),
      role,
      agentId,
      label: typeof step.label === 'string' ? step.label.trim().slice(0, 80) : undefined,
    });
  }
  if (steps.length !== 2) return null;
  if (steps[0].agentId === steps[1].agentId) return null;

  const triggerRaw =
    obj.trigger && typeof obj.trigger === 'object'
      ? (obj.trigger as Record<string, unknown>)
      : {};
  const mode = normalizeTriggerMode(triggerRaw.mode);

  return {
    steps,
    trigger: {
      mode,
      contentKeywords: normalizeKeywordList(triggerRaw.contentKeywords, PIPELINE_CONTENT_KEYS),
      creativeKeywords: normalizeKeywordList(triggerRaw.creativeKeywords, PIPELINE_CREATIVE_KEYS),
    },
  };
}

/** Config por defecto a partir de orquestadores seleccionados. */
export function createDefaultPipelineConfig(
  orchestratorIds: string[],
  resolveAgent: (id: string) => PipelineAgentProfile | undefined,
): PipelineConfig {
  const unique = [...new Set(orchestratorIds.filter((id) => /^[a-f0-9]{24}$/i.test(id)))];
  const entries = unique
    .map((id) => {
      const profile = resolveAgent(id);
      return profile ? { id, profile, name: profile.name?.trim() || id } : null;
    })
    .filter((x): x is { id: string; profile: PipelineAgentProfile; name: string } => x != null);

  let contentId = entries.find((e) => isContentCapableAgent(e.profile))?.id;
  let creativeId = entries.find((e) => isCreativeCapableAgent(e.profile) && e.id !== contentId)?.id;

  if (!contentId && entries[0]) contentId = entries[0].id;
  if (!creativeId) {
    creativeId = entries.find((e) => e.id !== contentId)?.id ?? entries[1]?.id ?? contentId;
  }
  if (!contentId || !creativeId || contentId === creativeId) {
    contentId = entries[0]?.id ?? unique[0] ?? '';
    creativeId = entries[1]?.id ?? unique[1] ?? contentId;
  }

  return {
    steps: [
      {
        id: newPipelineStepId(),
        role: 'content',
        agentId: contentId,
        label: 'Contenido y catálogo',
      },
      {
        id: newPipelineStepId(),
        role: 'creative',
        agentId: creativeId,
        label: 'Diseño e imagen',
      },
    ],
    trigger: { mode: 'mixed' },
  };
}

export function applyPipelineTemplate(
  template: PipelineTemplate,
  orchestratorIds: string[],
  resolveAgent: (id: string) => PipelineAgentProfile | undefined,
): PipelineConfig {
  const base = createDefaultPipelineConfig(orchestratorIds, resolveAgent);
  return {
    steps: template.steps.map((tpl, i) => ({
      id: base.steps[i]?.id ?? newPipelineStepId(),
      role: tpl.role,
      agentId: base.steps[i]?.agentId ?? base.steps[0].agentId,
      label: tpl.label,
    })),
    trigger: { ...template.trigger },
  };
}

export type PipelineSetupValidation = {
  ok: boolean;
  orchestratorCount: number;
  creativeAgentNames: string[];
  contentAgentNames: string[];
  warnings: string[];
};

/** Valida grilla de orquestadores (legacy + pipeline editor). */
export function validatePipelineWidgetSetup(
  orchestratorIds: string[],
  resolveAgent: (id: string) => PipelineAgentProfile | undefined,
): PipelineSetupValidation {
  const warnings: string[] = [];
  const unique = [...new Set(orchestratorIds.map((id) => id.trim()).filter(Boolean))];
  const entries = unique
    .map((id) => {
      const profile = resolveAgent(id);
      return profile ? { id, profile, name: profile.name?.trim() || id } : null;
    })
    .filter((x): x is { id: string; profile: PipelineAgentProfile; name: string } => x != null);

  if (unique.length < 2) {
    warnings.push('Selecciona al menos 2 agentes orquestadores en la grilla.');
  }

  const creativeAgentNames = entries
    .filter((e) => isCreativeCapableAgent(e.profile))
    .map((e) => e.name);
  const contentAgentNames = entries
    .filter((e) => isContentCapableAgent(e.profile))
    .map((e) => e.name);

  if (unique.length >= 2 && creativeAgentNames.length === 0) {
    warnings.push(
      'Ningún agente parece creativo (imagen, banner o diseño). El paso 2 solo devolverá texto, no un banner real.',
    );
  }

  if (unique.length >= 2 && contentAgentNames.length === 0) {
    warnings.push(
      'Ningún agente parece de contenido o catálogo. El paso 1 puede no extraer un brief útil.',
    );
  }

  if (
    unique.length >= 2 &&
    creativeAgentNames.length > 0 &&
    contentAgentNames.length > 0 &&
    creativeAgentNames.length === entries.length
  ) {
    warnings.push(
      'Todos los agentes parecen creativos. Añade uno de ventas, catálogo o almacenamiento para el paso de contenido.',
    );
  }

  const ok =
    unique.length >= 2 && creativeAgentNames.length >= 1 && contentAgentNames.length >= 1;

  return {
    ok,
    orchestratorCount: unique.length,
    creativeAgentNames,
    contentAgentNames,
    warnings,
  };
}

export type PipelineConfigValidation = {
  ok: boolean;
  warnings: string[];
  errors: string[];
};

/** Valida la configuración explícita del pipeline (pasos + disparador). */
export function validatePipelineConfig(
  config: PipelineConfig | null | undefined,
  orchestratorIds: string[],
  resolveAgent: (id: string) => PipelineAgentProfile | undefined,
): PipelineConfigValidation {
  const warnings: string[] = [];
  const errors: string[] = [];
  const allowed = new Set(orchestratorIds.filter((id) => /^[a-f0-9]{24}$/i.test(id)));

  if (!config) {
    errors.push('Configura el pipeline con dos pasos y agentes distintos.');
    return { ok: false, warnings, errors };
  }

  if (allowed.size < 2) {
    errors.push('Selecciona al menos 2 agentes orquestadores.');
    return { ok: false, warnings, errors };
  }

  if (config.steps.length !== 2) {
    errors.push('El pipeline requiere exactamente 2 pasos (contenido y creativo).');
  }

  const contentStep = config.steps.find((s) => s.role === 'content');
  const creativeStep = config.steps.find((s) => s.role === 'creative');

  if (!contentStep || !creativeStep) {
    errors.push('Debe haber un paso de contenido y uno creativo.');
  }

  for (const step of config.steps) {
    if (!allowed.has(step.agentId)) {
      errors.push(`El agente del paso «${step.label ?? pipelineRoleLabel(step.role)}» no está en la grilla.`);
    }
    const profile = resolveAgent(step.agentId);
    if (!profile) {
      errors.push(`Agente no encontrado en el paso «${step.label ?? pipelineRoleLabel(step.role)}».`);
      continue;
    }
    if (step.role === 'content' && !isContentCapableAgent(profile)) {
      warnings.push(
        `«${profile.name ?? step.agentId}» no parece de contenido; el brief puede ser pobre.`,
      );
    }
    if (step.role === 'creative' && !isCreativeCapableAgent(profile)) {
      warnings.push(
        `«${profile.name ?? step.agentId}» no parece creativo; puede no generar imagen real.`,
      );
    }
  }

  if (contentStep && creativeStep && contentStep.agentId === creativeStep.agentId) {
    errors.push('Los dos pasos deben usar agentes distintos.');
  }

  if (config.trigger.mode === 'keywords') {
    const hasAny =
      (config.trigger.contentKeywords?.length ?? 0) > 0 ||
      (config.trigger.creativeKeywords?.length ?? 0) > 0;
    if (!hasAny) {
      errors.push('Añade al menos una palabra clave o cambia el disparador a «Mixto» o «Siempre».');
    }
  }

  return { ok: errors.length === 0, warnings, errors };
}

export function messageHasCreativeSignal(
  message: string,
  creativeKeys: readonly string[] = PIPELINE_CREATIVE_KEYS,
): boolean {
  const msg = message.toLowerCase().trim();
  return creativeKeys.some((k) => msg.includes(k.toLowerCase())) || /\d+\s*[x×]\s*\d+/.test(msg);
}

export function messageHasContentSignal(
  message: string,
  contentKeys: readonly string[] = PIPELINE_CONTENT_KEYS,
): boolean {
  const msg = message.toLowerCase().trim();
  return contentKeys.some((k) => msg.includes(k.toLowerCase()));
}

/** ¿Debe ejecutarse el pipeline según el disparador configurado? */
export function shouldRunPipeline(message: string, trigger: PipelineConfig['trigger']): boolean {
  const msg = message.trim();
  if (!msg) return false;

  if (trigger.mode === 'always') return true;

  const contentKeys = trigger.contentKeywords?.length
    ? trigger.contentKeywords
    : [...PIPELINE_CONTENT_KEYS];
  const creativeKeys = trigger.creativeKeywords?.length
    ? trigger.creativeKeywords
    : [...PIPELINE_CREATIVE_KEYS];

  const hasContent = messageHasContentSignal(msg, contentKeys);
  const hasCreative = messageHasCreativeSignal(msg, creativeKeys);

  if (trigger.mode === 'mixed') return hasContent && hasCreative;
  if (trigger.mode === 'keywords') return hasContent || hasCreative;
  return false;
}

/** Compatibilidad con heurística anterior. */
export function isCompoundCreativeRequest(message: string): boolean {
  return shouldRunPipeline(message, { mode: 'mixed' });
}

export function swapPipelineSteps(config: PipelineConfig): PipelineConfig {
  if (config.steps.length !== 2) return config;
  const [a, b] = config.steps;
  return {
    ...config,
    steps: [
      { ...a, role: b.role, label: b.label ?? pipelineRoleLabel(b.role) },
      { ...b, role: a.role, label: a.label ?? pipelineRoleLabel(a.role) },
    ],
  };
}

export function updatePipelineStepAgent(
  config: PipelineConfig,
  stepId: string,
  agentId: string,
): PipelineConfig {
  return {
    ...config,
    steps: config.steps.map((s) => (s.id === stepId ? { ...s, agentId } : s)),
  };
}

export function updatePipelineTrigger(
  config: PipelineConfig,
  patch: Partial<PipelineConfig['trigger']>,
): PipelineConfig {
  return {
    ...config,
    trigger: {
      ...config.trigger,
      ...patch,
      contentKeywords: patch.contentKeywords ?? config.trigger.contentKeywords,
      creativeKeywords: patch.creativeKeywords ?? config.trigger.creativeKeywords,
    },
  };
}
