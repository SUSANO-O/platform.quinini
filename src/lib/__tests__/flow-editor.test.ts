import { describe, expect, it } from 'vitest';
import {
  createFlowNode,
  createStartNode,
  supportTicketTemplate,
  DEFAULT_FLOW_SETTINGS,
} from '@/lib/flow-editor/constants';
import {
  buildConnectionPath,
  getHandlePosition,
  getInputHandlePosition,
  initialsFromName,
} from '@/lib/flow-editor/geometry';

describe('flow editor constants', () => {
  it('start node has fixed id', () => {
    expect(createStartNode().id).toBe('start');
  });

  it('support ticket template has connected graph', () => {
    const { nodes, connections } = supportTicketTemplate();
    expect(nodes.length).toBeGreaterThan(4);
    expect(connections.length).toBeGreaterThan(4);
    expect(nodes.some((n) => n.id === 'start')).toBe(true);
    expect(nodes.some((n) => n.type === 'end')).toBe(true);
  });

  it('multiple choice node includes options', () => {
    const node = createFlowNode('multiple_choice', 10, 20);
    expect(node.options?.length).toBeGreaterThanOrEqual(2);
  });

  it('default settings include widget channel', () => {
    expect(DEFAULT_FLOW_SETTINGS.enabledChannels).toContain('widget');
  });
});

describe('flow editor geometry', () => {
  it('builds bezier path between two points', () => {
    const d = buildConnectionPath({ x: 100, y: 100 }, { x: 200, y: 300 });
    expect(d.startsWith('M 100 100')).toBe(true);
    expect(d).toContain('C');
  });

  it('resolves output and input handles', () => {
    const node = createFlowNode('text', 50, 80);
    const out = getHandlePosition(node, 'output');
    const input = getInputHandlePosition(node);
    expect(out.y).toBeGreaterThan(input.y);
  });

  it('initials from display name', () => {
    expect(initialsFromName('Li Marle')).toBe('LM');
    expect(initialsFromName('Ana')).toBe('AN');
    expect(initialsFromName('Agente de nutricion')).toBe('AN');
    expect(initialsFromName('agente del agua')).toBe('AA');
    expect(initialsFromName('Asesor de Taller Experto')).toBe('AE');
    expect(initialsFromName('Arquitecto de Agentes AI')).toBe('AI');
  });
});
