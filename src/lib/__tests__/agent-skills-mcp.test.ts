import { describe, expect, it } from 'vitest';
import {
  agentSkillsNeedMcpTools,
  SKILL_IDS_WITH_MCP_TOOLS,
} from '@/lib/agent-skills-mcp';

describe('agentSkillsNeedMcpTools', () => {
  it('detecta web_search por id legacy', () => {
    expect(agentSkillsNeedMcpTools({ skills: ['web_search'] })).toBe(true);
    expect(SKILL_IDS_WITH_MCP_TOOLS.has('web_search')).toBe(true);
  });

  it('detecta active_tools en skillsConfig', () => {
    expect(
      agentSkillsNeedMcpTools({
        skillsConfig: [
          {
            id: 'custom_x',
            enabled: true,
            config: { active_tools: ['mcp:webSearch:web_search'] },
          },
        ],
      }),
    ).toBe(true);
  });

  it('ignora skills solo prompt (sin MCP)', () => {
    expect(
      agentSkillsNeedMcpTools({
        skills: ['customer_service', 'brand_voice', 'knowledge_base'],
        skillsConfig: [
          { id: 'customer_service', enabled: true, config: { active_tools: [] } },
        ],
      }),
    ).toBe(false);
  });

  it('ignora skills deshabilitadas con tools', () => {
    expect(
      agentSkillsNeedMcpTools({
        skillsConfig: [
          {
            id: 'web_search',
            enabled: false,
            config: { active_tools: ['mcp:webSearch:web_search'] },
          },
        ],
      }),
    ).toBe(false);
  });
});
