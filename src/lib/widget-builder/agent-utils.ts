import type { ClientAgentRow } from './types';

export function effectiveWidgetAgentId(a: ClientAgentRow): string {
  if (/^[a-fA-F0-9]{24}$/.test(a._id)) return a._id;
  const hub = typeof a.agentHubId === 'string' ? a.agentHubId.trim() : '';
  if (hub) return hub;
  return '';
}

export function resolveStoredWidgetAgentId(stored: string, list: ClientAgentRow[]): string {
  const s = stored.trim();
  if (!s) return '';
  for (const a of list) {
    const eff = effectiveWidgetAgentId(a);
    if (eff && (eff === s || eff.toLowerCase() === s.toLowerCase())) return eff;
    const hub = typeof a.agentHubId === 'string' ? a.agentHubId.trim() : '';
    if (hub && (hub === s || hub.toLowerCase() === s.toLowerCase())) return eff;
    if (a._id === s || a._id.toLowerCase() === s.toLowerCase()) return eff;
  }
  return s;
}

export function sortAgentsForWidgetPicker(list: ClientAgentRow[]): ClientAgentRow[] {
  return [...list].sort((x, y) => {
    const px = x.isPlatform ? 1 : 0;
    const py = y.isPlatform ? 1 : 0;
    if (py !== px) return py - px;
    return x.name.localeCompare(y.name, 'es');
  });
}

export function firstSelectableWidgetAgentId(list: ClientAgentRow[]): string | null {
  for (const a of sortAgentsForWidgetPicker(list)) {
    const id = effectiveWidgetAgentId(a);
    if (id) return id;
  }
  return null;
}

export function agentProfileFromRow(a: ClientAgentRow) {
  return {
    name: a.name,
    description: a.description,
    model: a.model,
    enabledMcpToolIds: a.enabledMcpToolIds,
  };
}

export function resolveAgentProfileByWidgetId(list: ClientAgentRow[], widgetAgentId: string) {
  for (const a of list) {
    const eff = effectiveWidgetAgentId(a);
    if (eff === widgetAgentId || a._id === widgetAgentId) return agentProfileFromRow(a);
  }
  return undefined;
}
