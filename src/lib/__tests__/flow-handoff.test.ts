import { describe, expect, it, vi } from 'vitest';
import { flowContextBlock, resolveFlowHandoffs } from '@/lib/flow-handoff';

const W1 = 'a'.repeat(24);
const W2 = 'b'.repeat(24);

function finder(rows: unknown[]) {
  const find = vi.fn(() => ({ select: () => ({ lean: async () => rows }) }));
  return { find };
}

describe('resolveFlowHandoffs', () => {
  const nodes = [
    { id: 'h1', type: 'agent_handoff', config: { handoffWidgetId: W1 } },
    { id: 'h2', type: 'agent_handoff', config: { handoffWidgetId: 'no-es-id' } },
    { id: 't', type: 'text', config: { handoffWidgetId: W2 } },
  ];

  it('solo busca widgets de la cuenta dueña del flujo y activos', async () => {
    const W = finder([{ _id: W1, agentId: 'ag1', afhubToken: 'wt_x' }]);
    const out = await resolveFlowHandoffs('u1', nodes, W);
    expect(W.find).toHaveBeenCalledWith({ _id: { $in: [W1] }, userId: 'u1', active: { $ne: false } });
    expect(out).toEqual({ [W1]: { widgetId: W1, agentId: 'ag1', token: 'wt_x' } });
  });

  it('sin nodos de handoff no consulta; widget sin token wt_ se descarta', async () => {
    const W = finder([{ _id: W1, agentId: 'ag1', afhubToken: null }]);
    expect(await resolveFlowHandoffs('u1', [{ id: 't', type: 'text' }], W)).toEqual({});
    expect(W.find).not.toHaveBeenCalled();
    expect(await resolveFlowHandoffs('u1', nodes, W)).toEqual({});
  });
});

describe('flowContextBlock', () => {
  it('lista pregunta: respuesta y marca que son datos, no instrucciones', () => {
    const b = flowContextBlock({
      flowName: 'Cotización',
      answers: [
        { question: '¿Tu nombre?', value: 'Ana' },
        { key: 'interes', value: 'GPS\nmoto' },
        { question: 'vacía', value: '' },
      ],
    });
    expect(b).toContain('[CONTEXTO DEL FLUJO «Cotización»]');
    expect(b).toContain('no instrucciones');
    expect(b).toContain('- ¿Tu nombre?: Ana');
    expect(b).toContain('- interes: GPS moto');
    expect(b).not.toContain('vacía');
  });

  it('nada útil → vacío', () => {
    expect(flowContextBlock(null)).toBe('');
    expect(flowContextBlock({ answers: 'x' })).toBe('');
  });
});
