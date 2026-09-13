/**
 * Reglas del listado de agentes.
 *
 * Estaban repartidas entre `src/app/dashboard/agents/page.tsx` (los filtros) y
 * `src/components/dashboard/agent-list-card.tsx` (las etiquetas de la tarjeta),
 * dentro de componentes que este repo no puede probar: el runner corre en
 * `environment: 'node'` y solo toma `*.test.ts`.
 */

import { formatDayLabel } from '@/lib/panel-dates';

export type AgentLike = {
  _id: string;
  name: string;
  description: string;
  model: string;
  type: 'agent' | 'sub-agent';
  status: 'active' | 'disabled';
  tools: { toolId: string }[];
  subAgentIds: string[];
  syncStatus: string;
  ragEnabled: boolean;
  ragSources?: unknown[];
  createdAt: string;
  isPlatform?: boolean;
  skills?: string[];
};

export type AgentFilter = 'all' | 'active' | 'inactive' | 'platform';

export function filterAgentsByStatus<T extends { status: AgentLike['status'] }>(
  list: T[],
  filter: AgentFilter,
): T[] {
  if (filter === 'active') return list.filter((a) => a.status === 'active');
  if (filter === 'inactive') return list.filter((a) => a.status === 'disabled');
  return list;
}

export function filterAgentsBySearch<T extends { name?: string; description?: string }>(
  list: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((agent) => {
    const name = agent.name?.toLowerCase() ?? '';
    const desc = agent.description?.toLowerCase() ?? '';
    return name.includes(q) || desc.includes(q);
  });
}

/**
 * Fecha en palabras, medida en la zona del panel (ver `panel-dates`) y no en
 * el reloj de quien mire. Un `createdAt` corrupto da un guion, no "Invalid Date".
 */
export function formatUpdatedLabel(iso: string, now: Date = new Date()): string {
  return formatDayLabel(iso, now);
}

/** Cuando no hay etiqueta legible del modelo, sirve el último tramo del id. */
export function shortModelDisplay(modelId: string, label: string): string {
  if (label !== modelId) return label;
  const segment = modelId.split('/').filter(Boolean).pop();
  return segment ?? modelId;
}

export function skillsCount(agent: Pick<AgentLike, 'skills'>): number {
  return (agent.skills ?? []).filter((id) => typeof id === 'string' && id.trim().length > 0).length;
}

export type ChipTone = 'neutral' | 'accent' | 'warning';

export type AgentChip = {
  key: 'model' | 'rag' | 'skills' | 'subagents' | 'tools';
  label: string;
  title?: string;
  tone: ChipTone;
};

/**
 * Tope de etiquetas por tarjeta. La versión anterior podía pintar ocho a la
 * vez —modelo, herramientas, sub-agentes, RAG, sync, fecha, plataforma y
 * skills— y ninguna se leía. La fecha y el estado de sync salieron de aquí:
 * son metadato, van en la línea secundaria de la tarjeta.
 */
export const MAX_AGENT_CHIPS = 4;

/**
 * Etiquetas de la tarjeta, en orden de importancia y recortadas al tope.
 * `overflow` es cuántas quedaron fuera, para decirlo con un "+N".
 */
export function agentCardChips(
  agent: AgentLike,
  getModelLabel: (id: string) => string,
): { chips: AgentChip[]; overflow: number } {
  const modelLabel = getModelLabel(agent.model);
  const candidatas: AgentChip[] = [
    { key: 'model', label: shortModelDisplay(agent.model, modelLabel), title: modelLabel, tone: 'neutral' },
  ];

  const ragN = Array.isArray(agent.ragSources) ? agent.ragSources.length : 0;
  if (agent.ragEnabled) {
    candidatas.push(
      ragN > 0
        ? { key: 'rag', label: `RAG · ${ragN}`, tone: 'neutral' }
        // Encendido y sin nada que consultar: eso el dueño tiene que verlo.
        : { key: 'rag', label: 'RAG sin fuentes', tone: 'warning' },
    );
  } else if (ragN > 0) {
    candidatas.push({ key: 'rag', label: `RAG off · ${ragN}`, tone: 'neutral' });
  }

  const skillN = skillsCount(agent);
  if (skillN > 0) {
    candidatas.push({ key: 'skills', label: `${skillN} skill${skillN !== 1 ? 's' : ''}`, tone: 'accent' });
  }

  const subN = agent.subAgentIds?.length ?? 0;
  if (subN > 0) {
    candidatas.push({ key: 'subagents', label: `${subN} sub-agente${subN !== 1 ? 's' : ''}`, tone: 'neutral' });
  }

  const toolN = (agent.tools ?? []).length;
  if (toolN > 0) {
    candidatas.push({ key: 'tools', label: `${toolN} herramienta${toolN !== 1 ? 's' : ''}`, tone: 'neutral' });
  }

  return {
    chips: candidatas.slice(0, MAX_AGENT_CHIPS),
    overflow: Math.max(0, candidatas.length - MAX_AGENT_CHIPS),
  };
}
