import { describe, expect, it } from 'vitest';
import { buildAgentPickerMetaChips, shortModelLabel } from '@/lib/widget-builder/agent-picker-meta';
import type { ClientAgentRow } from '@/lib/widget-builder';

const baseAgent: ClientAgentRow = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Demo',
  type: 'agent',
  status: 'active',
};

describe('agent picker meta', () => {
  it('shortens model id', () => {
    expect(shortModelLabel('google/gemini-2.5-flash')).toBe('gemini-2.5-flash');
  });

  it('builds chips for model, mcp, rag, subs and tasks', () => {
    const chips = buildAgentPickerMetaChips({
      ...baseAgent,
      model: 'gemini-2.5-flash',
      enabledMcpToolIds: ['mcp:a', 'mcp:b'],
      tools: [{ toolId: 'webhook' }],
      ragEnabled: true,
      ragSources: [{}, {}],
      subAgentIds: ['1', '2', '3'],
      scheduledTaskCount: 2,
      skills: ['web_search'],
    });

    expect(chips).toEqual([
      'gemini-2.5-flash',
      'MCP 2',
      '1 tool',
      'RAG 2',
      '3 subs',
      '2 tareas',
      '1 skill',
    ]);
  });
});
