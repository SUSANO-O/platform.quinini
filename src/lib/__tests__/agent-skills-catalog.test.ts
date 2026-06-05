import { describe, expect, it } from 'vitest';
import { DEFAULT_AGENT_SKILLS_CATALOG } from '@/lib/agent-skills-catalog-defaults';
import {
  buildSkillConfigEntry,
  normalizeAgentSkillsState,
  skillsConfigForSave,
} from '@/lib/agent-skills-catalog';

const CATALOG = DEFAULT_AGENT_SKILLS_CATALOG;

describe('agent-skills-catalog', () => {
  it('buildSkillConfigEntry incluye config completa para perfiles', () => {
    const row = buildSkillConfigEntry(CATALOG, 'sales_closer', true);
    expect(row?.config?.prompt_extension).toContain('SPIN');
    expect(row?.config?.active_tools).toContain('mcp:hubspot:hubspot_create_contact');
    expect(row?.config?.llm_settings?.temperature).toBe(0.7);
  });

  it('normalizeAgentSkillsState hidrata legacy skills[]', () => {
    const rows = normalizeAgentSkillsState(CATALOG, ['web_search', 'crm_integration'], []);
    expect(rows.map((r) => r.id).sort()).toEqual(['crm_integration', 'web_search']);
    expect(rows[0].config?.active_tools?.length).toBeGreaterThan(0);
  });

  it('skillsConfigForSave solo persiste habilitadas con config', () => {
    const { skillsConfig, skillIds } = skillsConfigForSave(CATALOG, [
      { id: 'tech_support_l1', enabled: true, priority: 40 },
      { id: 'web_search', enabled: false },
    ]);
    expect(skillIds).toEqual(['tech_support_l1']);
    expect(skillsConfig[0].config?.prompt_extension).toContain('diagnostico');
  });
});
