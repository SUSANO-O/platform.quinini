import type { ClientAgentRow } from './types';

export function shortModelLabel(modelId: string | undefined): string {
  const trimmed = modelId?.trim() ?? '';
  if (!trimmed) return '';
  const segment = trimmed.split('/').filter(Boolean).pop();
  return segment ?? trimmed;
}

export function buildAgentPickerMetaChips(agent: ClientAgentRow, extra?: string[]): string[] {
  const chips: string[] = [];

  const model = shortModelLabel(agent.model);
  if (model) chips.push(model);

  const mcpCount = agent.enabledMcpToolIds?.length ?? 0;
  if (mcpCount > 0) chips.push(`MCP ${mcpCount}`);

  const toolCount = agent.tools?.length ?? 0;
  if (toolCount > 0) chips.push(`${toolCount} tool${toolCount !== 1 ? 's' : ''}`);

  const ragCount = Array.isArray(agent.ragSources) ? agent.ragSources.length : 0;
  if (agent.ragEnabled) {
    chips.push(ragCount > 0 ? `RAG ${ragCount}` : 'RAG');
  }

  const subCount = agent.subAgentIds?.length ?? 0;
  if (subCount > 0) chips.push(`${subCount} sub${subCount !== 1 ? 's' : ''}`);

  const taskCount = agent.scheduledTaskCount ?? 0;
  if (taskCount > 0) chips.push(`${taskCount} tarea${taskCount !== 1 ? 's' : ''}`);

  const skillCount = agent.skills?.length ?? 0;
  if (skillCount > 0) chips.push(`${skillCount} skill${skillCount !== 1 ? 's' : ''}`);

  if (agent.isPlatform) chips.push('Plataforma');

  if (extra?.length) chips.push(...extra);

  return chips;
}
