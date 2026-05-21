/**
 * Validación de pipeline contenido→creativo para el Widget Builder (client-safe).
 * Sin dependencias de Mongoose — importable desde componentes 'use client'.
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

export type PipelineAgentProfile = {
  name?: string;
  description?: string;
  model?: string;
  enabledMcpToolIds?: string[];
};

const AGENT_CREATIVE_PROFILE_RE =
  /imagen|banner|creativ|diseño|diseno|visual|graphic|logo|ilustr|photo|foto|arte gráf|art gráf|midjourney|dall·e|dalle|stable diffusion|flux/i;

const AGENT_CONTENT_PROFILE_RE =
  /venta|vendedor|producto|catálogo|catalogo|finanz|soporte|consultor|inversi|cotiz|precio|rag|ficha técnica|ficha tecnica|autos|vehículo|vehiculo/i;

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

/** Agente apto para el paso creativo del pipeline (imagen, banner, diseño). */
export function isCreativeCapableAgent(agent: PipelineAgentProfile): boolean {
  if (isImageGenerationModel(agent.model ?? '')) return true;
  const text = `${agent.name ?? ''} ${agent.description ?? ''}`.toLowerCase();
  if (AGENT_CREATIVE_PROFILE_RE.test(text)) return true;
  if (PIPELINE_CREATIVE_KEYS.some((k) => text.includes(k))) return true;
  const tools = agent.enabledMcpToolIds ?? [];
  return tools.some((t) => /image|banner|dall|flux|diffusion|text-to-image|generat.*img/i.test(t));
}

/** Agente apto para el paso de contenido (catálogo, ventas, datos). */
export function isContentCapableAgent(agent: PipelineAgentProfile): boolean {
  const text = `${agent.name ?? ''} ${agent.description ?? ''}`.toLowerCase();
  if (AGENT_CONTENT_PROFILE_RE.test(text)) return true;
  return PIPELINE_CONTENT_KEYS.some((k) => text.includes(k));
}

export type PipelineSetupValidation = {
  ok: boolean;
  orchestratorCount: number;
  creativeAgentNames: string[];
  contentAgentNames: string[];
  warnings: string[];
};

/** Valida la grilla del widget en modo pipeline (UI + guardado). */
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
      'Ningún agente parece creativo (imagen, banner o diseño). El paso 2 del pipeline solo devolverá texto, no un banner real.',
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
      'Todos los agentes parecen creativos. Añade uno de ventas, catálogo o RAG para el paso de contenido.',
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
