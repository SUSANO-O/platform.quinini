/**
 * Detección ligera (sin I/O) de si las skills del agente requieren ruta MCP.
 * Usado en routing del widget: no consultar catálogo Mongo ni abrir conexiones.
 */
import { DEFAULT_AGENT_SKILLS_CATALOG } from '@/lib/agent-skills-catalog-defaults';

function isMcpToolId(id: string): boolean {
  return id.startsWith('mcp:') || id.startsWith('std:');
}

/** Skill IDs de la semilla que declaran al menos un tool MCP/std. */
export const SKILL_IDS_WITH_MCP_TOOLS: ReadonlySet<string> = new Set(
  DEFAULT_AGENT_SKILLS_CATALOG.filter((s) =>
    (s.config.active_tools ?? []).some((t) => typeof t === 'string' && isMcpToolId(t.trim())),
  ).map((s) => s.id),
);

export type SkillsMcpProbeDoc = {
  skills?: string[] | null;
  skillsConfig?: Array<{
    id?: string;
    enabled?: boolean;
    config?: { active_tools?: string[] };
  }> | null;
};

/**
 * true si alguna skill habilitada declara tools MCP (en skillsConfig o por id de semilla).
 * Complejidad O(skills); sin red ni disco.
 */
export function agentSkillsNeedMcpTools(doc: SkillsMcpProbeDoc | null | undefined): boolean {
  if (!doc) return false;

  const rows = Array.isArray(doc.skillsConfig) ? doc.skillsConfig : [];
  for (const row of rows) {
    if (!row || row.enabled === false) continue;
    const tools = row.config?.active_tools;
    if (Array.isArray(tools)) {
      for (const t of tools) {
        if (typeof t === 'string' && isMcpToolId(t.trim())) return true;
      }
    }
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (id && SKILL_IDS_WITH_MCP_TOOLS.has(id)) return true;
  }

  const legacy = Array.isArray(doc.skills) ? doc.skills : [];
  for (const raw of legacy) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (id && SKILL_IDS_WITH_MCP_TOOLS.has(id)) return true;
  }

  return false;
}
