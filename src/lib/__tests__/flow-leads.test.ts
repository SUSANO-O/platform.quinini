import { describe, expect, it } from 'vitest';
import { extractFlowLead, sanitizeFlowAnswers, sanitizeFlowSource } from '@/lib/flow-leads';

const nodes = [
  { id: 'n1', type: 'text', question: '¿Cómo te llamas?', config: { variableKey: 'nombre' } },
  { id: 'n2', type: 'email', question: '¿Tu correo?' },
  { id: 'n3', type: 'phone', question: '¿Tu teléfono?' },
  { id: 'n4', type: 'multiple_choice', question: '¿Qué te interesa?', config: { variableKey: 'interes' } },
  { id: 'n5', type: 'text', question: 'Cuéntanos más' },
];

const answers = [
  { nodeId: 'n1', key: 'nombre', value: 'Ana Pérez', label: 'Ana Pérez' },
  { nodeId: 'n2', key: 'n2', value: 'ANA@Example.com ' },
  { nodeId: 'n3', key: 'n3', value: '+57 300 111 2233' },
  { nodeId: 'n4', key: 'interes', value: 'gps_moto', label: 'GPS para moto' },
  { nodeId: 'n5', key: 'n5', value: 'Lo quiero para mi hijo' },
];

describe('extractFlowLead', () => {
  it('saca nombre, email y teléfono por el TIPO de nodo y lista todas las respuestas con su pregunta', () => {
    const lead = extractFlowLead(nodes, answers);
    expect(lead).toEqual({
      name: 'Ana Pérez',
      email: 'ana@example.com',
      phone: '+57 300 111 2233',
      fields: [
        { key: 'nombre', question: '¿Cómo te llamas?', value: 'Ana Pérez' },
        { key: 'n2', question: '¿Tu correo?', value: 'ANA@Example.com' },
        { key: 'n3', question: '¿Tu teléfono?', value: '+57 300 111 2233' },
        { key: 'interes', question: '¿Qué te interesa?', value: 'GPS para moto' },
        { key: 'n5', question: 'Cuéntanos más', value: 'Lo quiero para mi hijo' },
      ],
    });
  });

  it('nombre también por la pregunta ("tu nombre") si no hay variableKey', () => {
    const lead = extractFlowLead(
      [{ id: 'a', type: 'text', question: 'Escribe tu nombre completo' }, { id: 'p', type: 'phone' }],
      [{ nodeId: 'a', key: 'a', value: 'Luis' }, { nodeId: 'p', key: 'p', value: '3001234567' }],
    );
    expect(lead?.name).toBe('Luis');
  });

  it('sin email ni teléfono → no es lead', () => {
    expect(extractFlowLead(nodes, [answers[0], answers[3]])).toBeNull();
  });

  it('email inválido no cuenta; la última respuesta de un nodo gana (si volvió atrás)', () => {
    const lead = extractFlowLead(nodes, [
      { nodeId: 'n2', key: 'n2', value: 'no-es-correo' },
      { nodeId: 'n3', key: 'n3', value: '3001' },
      { nodeId: 'n3', key: 'n3', value: '3009998877' },
    ]);
    expect(lead?.email).toBeUndefined();
    expect(lead?.phone).toBe('3009998877');
  });

  it('ignora respuestas de nodos que no existen en el flujo', () => {
    expect(extractFlowLead(nodes, [{ nodeId: 'zz', key: 'x', value: 'a@b.co' }])).toBeNull();
  });
});

describe('sanitizeFlowAnswers', () => {
  it('limita cantidad y largo, descarta basura', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ nodeId: `n${i}`, key: `k${i}`, value: 'x'.repeat(5000) }));
    const out = sanitizeFlowAnswers([...many, 'basura', null, { nodeId: 1 }]);
    expect(out).toHaveLength(100);
    expect(out[0].value.length).toBe(2000);
  });
});

describe('sanitizeFlowSource', () => {
  it('guarda ruta y utm_*; nunca otros parámetros', () => {
    expect(
      sanitizeFlowSource('https://tribugps.com/precios?utm_source=fb&utm_campaign=moto&email=a@b.co&token=x#top'),
    ).toEqual({ pagePath: '/precios', utm: { utm_campaign: 'moto', utm_source: 'fb' } });
    expect(sanitizeFlowSource('javascript:alert(1)')).toBeNull();
  });
});
