/**
 * Compatibilidad: re-export del catálogo por defecto (semilla) y helpers de etiqueta.
 */
import { DEFAULT_AGENT_SKILLS_CATALOG } from '@/lib/agent-skills-catalog-defaults';
import { makeSkillCatalogMap, type AgentSkillCatalogEntry } from '@/lib/agent-skills-catalog';

export type AgentSkill = Pick<
  AgentSkillCatalogEntry,
  'id' | 'label' | 'description' | 'color'
>;

export const AGENT_SKILLS: AgentSkill[] = DEFAULT_AGENT_SKILLS_CATALOG.map((s) => ({
  id: s.id,
  label: s.label,
  description: s.description,
  color: s.color,
}));

export const SKILL_MAP = makeSkillCatalogMap(DEFAULT_AGENT_SKILLS_CATALOG);

export function getSkillLabel(id: string): string {
  return SKILL_MAP.get(id)?.label ?? id;
}

export function getSkillColor(id: string): string {
  return SKILL_MAP.get(id)?.color ?? '#94a3b8';
}
