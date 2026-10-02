import { describe, expect, it } from 'vitest';
import { buildFlowFunnel } from '@/lib/flow-stats';

const nodes = [
  { id: 'start', type: 'start' },
  { id: 'n1', type: 'text', question: '¿Cómo te llamas?' },
  { id: 'c1', type: 'condition', question: 'solo editor' },
  { id: 'n2', type: 'email', question: '¿Tu correo?' },
  { id: 'n3', type: 'multiple_choice', question: '¿Qué vehículo?' },
  { id: 'end', type: 'end', question: '¡Gracias!' },
  { id: 'huerfano', type: 'text', question: 'nunca conectado' },
];
const connections = [
  { fromNodeId: 'start', toNodeId: 'n1' },
  { fromNodeId: 'n1', toNodeId: 'c1' },
  { fromNodeId: 'c1', toNodeId: 'n2' },
  { fromNodeId: 'n2', toNodeId: 'n3' },
  { fromNodeId: 'n3', toNodeId: 'end' },
];

describe('buildFlowFunnel', () => {
  it('ordena por el recorrido desde el inicio, omite nodos de control y sin conectar, y calcula abandono', () => {
    const funnel = buildFlowFunnel(
      nodes,
      connections,
      new Map([['n1', 100], ['n2', 70], ['n3', 40], ['end', 30]]),
      new Map([['n1', 30], ['n2', 30], ['n3', 10]]),
    );
    expect(funnel.map((s) => s.nodeId)).toEqual(['n1', 'n2', 'n3', 'end']);
    expect(funnel[0]).toEqual({ nodeId: 'n1', type: 'text', label: '¿Cómo te llamas?', reached: 100, dropped: 30, dropRate: 30 });
    expect(funnel[1].dropRate).toBe(43);
    expect(funnel[3]).toMatchObject({ nodeId: 'end', reached: 30, dropped: 0, dropRate: 0 });
  });

  it('sin datos → pasos con ceros (no divide por cero)', () => {
    const f = buildFlowFunnel(nodes, connections, new Map(), new Map());
    expect(f.every((s) => s.reached === 0 && s.dropRate === 0)).toBe(true);
  });

  it('ciclos (saltos hacia atrás) no cuelgan el recorrido', () => {
    const f = buildFlowFunnel(nodes, [...connections, { fromNodeId: 'n3', toNodeId: 'n1' }], new Map(), new Map());
    expect(f.map((s) => s.nodeId)).toEqual(['n1', 'n2', 'n3', 'end']);
  });
});
