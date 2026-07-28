import type { AgentDetailTabId } from '@/components/dashboard/agent-detail-tabs';

/** Alias en español e inglés → id interno de pestaña del editor de agente. */
export const AGENT_TAB_HASH_ALIASES: Record<string, AgentDetailTabId> = {
  general: 'general',
  reglas: 'rules',
  rules: 'rules',
  faq: 'faqs',
  faqs: 'faqs',
  herramientas: 'tools',
  tools: 'tools',
  almacen: 'rag',
  almacenamiento: 'rag',
  rag: 'rag',
  'sub-agentes': 'subagents',
  subagentes: 'subagents',
  subagents: 'subagents',
  tareas: 'scheduled-tasks',
  'scheduled-tasks': 'scheduled-tasks',
  whatsapp: 'whatsapp',
};

export const AGENT_TAB_IDS = Object.values(AGENT_TAB_HASH_ALIASES).filter(
  (id, i, arr) => arr.indexOf(id) === i,
) as AgentDetailTabId[];

export function parseAgentTabHash(raw: string | null | undefined): AgentDetailTabId | null {
  const key = (raw ?? '').replace(/^#/, '').trim().toLowerCase();
  if (!key) return null;
  return AGENT_TAB_HASH_ALIASES[key] ?? null;
}

export function agentDetailPath(agentId: string, tab?: AgentDetailTabId | null): string {
  const base = `/dashboard/agents/${encodeURIComponent(agentId)}`;
  if (!tab || tab === 'general') return base;
  return `${base}#${tab}`;
}

export function readWindowHash(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash;
}

export function writeWindowHash(tab: string, defaultTab = 'general', replace = true): void {
  if (typeof window === 'undefined') return;
  const hash = !tab || tab === defaultTab ? '' : `#${tab}`;
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  if (replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
}
