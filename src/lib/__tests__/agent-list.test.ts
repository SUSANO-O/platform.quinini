import { describe, it, expect } from 'vitest';
import {
  filterAgentsByStatus,
  filterAgentsBySearch,
  formatUpdatedLabel,
  shortModelDisplay,
  skillsCount,
  agentCardChips,
  MAX_AGENT_CHIPS,
  type AgentLike,
} from '@/lib/agent-list';

const base: AgentLike = {
  _id: 'a1',
  name: 'Nairito',
  description: 'Ventas de Tribu GPS',
  model: 'google/gemini-2.5-flash',
  type: 'agent',
  status: 'active',
  tools: [],
  subAgentIds: [],
  syncStatus: 'pending',
  ragEnabled: false,
  createdAt: '2026-08-01T10:00:00.000Z',
};

describe('filterAgentsByStatus', () => {
  const list: AgentLike[] = [
    { ...base, _id: 'on', status: 'active' },
    { ...base, _id: 'off', status: 'disabled' },
  ];

  it('activos e inactivos', () => {
    expect(filterAgentsByStatus(list, 'active').map(a => a._id)).toEqual(['on']);
    expect(filterAgentsByStatus(list, 'inactive').map(a => a._id)).toEqual(['off']);
  });

  it('"todos" y "plataforma" no recortan por estado', () => {
    expect(filterAgentsByStatus(list, 'all')).toHaveLength(2);
    expect(filterAgentsByStatus(list, 'platform')).toHaveLength(2);
  });
});

describe('filterAgentsBySearch', () => {
  const list: AgentLike[] = [
    { ...base, _id: '1', name: 'Nairito', description: 'Ventas de Tribu GPS' },
    { ...base, _id: '2', name: 'Facturación', description: 'Cobros y recibos' },
  ];

  it('busca en el nombre y en la descripción', () => {
    expect(filterAgentsBySearch(list, 'nair').map(a => a._id)).toEqual(['1']);
    expect(filterAgentsBySearch(list, 'cobros').map(a => a._id)).toEqual(['2']);
  });

  it('ignora mayúsculas y espacios de sobra', () => {
    expect(filterAgentsBySearch(list, '  TRIBU  ').map(a => a._id)).toEqual(['1']);
  });

  it('una búsqueda vacía devuelve todo', () => {
    expect(filterAgentsBySearch(list, '   ')).toHaveLength(2);
  });

  it('tolera agentes sin descripción', () => {
    const sinDesc = [{ ...base, description: '' }];
    expect(filterAgentsBySearch(sinDesc, 'nairito')).toHaveLength(1);
  });
});

describe('formatUpdatedLabel', () => {
  // Mide en la zona del panel (America/Bogota), no en el reloj de la máquina,
  // así que estas fechas dan el mismo resultado corra donde corra la suite.
  const ahora = new Date('2026-08-15T17:00:00.000Z'); // 12:00 en Bogotá

  it('hoy y ayer se dicen con palabras', () => {
    expect(formatUpdatedLabel('2026-08-15T14:00:00.000Z', ahora)).toBe('Hoy');
    expect(formatUpdatedLabel('2026-08-14T14:00:00.000Z', ahora)).toBe('Ayer');
  });

  // 02:00 UTC del 15 son las 21:00 del 14 en Bogotá: ayer, no hoy.
  it('la madrugada UTC cuenta como el día anterior', () => {
    expect(formatUpdatedLabel('2026-08-15T02:00:00.000Z', ahora)).toBe('Ayer');
  });

  it('más atrás va con fecha corta', () => {
    expect(formatUpdatedLabel('2026-08-01T14:00:00.000Z', ahora)).toMatch(/1/);
  });

  // Un `createdAt` corrupto no debe pintar "Invalid Date" en la tarjeta.
  it('una fecha inválida no rompe la tarjeta', () => {
    expect(formatUpdatedLabel('no-es-fecha', ahora)).toBe('—');
    expect(formatUpdatedLabel('', ahora)).toBe('—');
  });
});

describe('shortModelDisplay', () => {
  it('si hay etiqueta legible, se usa', () => {
    expect(shortModelDisplay('google/gemini-2.5-flash', 'Gemini 2.5 Flash')).toBe('Gemini 2.5 Flash');
  });

  it('sin etiqueta, se queda el último segmento', () => {
    expect(shortModelDisplay('google/gemini-2.5-flash', 'google/gemini-2.5-flash')).toBe('gemini-2.5-flash');
  });

  it('un id sin barras se devuelve tal cual', () => {
    expect(shortModelDisplay('gpt-4o', 'gpt-4o')).toBe('gpt-4o');
  });
});

describe('skillsCount', () => {
  it('cuenta solo las skills con contenido', () => {
    expect(skillsCount({ ...base, skills: ['a', '', '  ', 'b'] })).toBe(2);
  });

  it('sin skills es cero', () => {
    expect(skillsCount(base)).toBe(0);
  });
});

describe('agentCardChips', () => {
  const etiqueta = () => 'Gemini 2.5 Flash';

  it('el modelo siempre va primero', () => {
    expect(agentCardChips(base, etiqueta).chips[0].key).toBe('model');
  });

  // El problema que se está arreglando: hasta ocho chips en una tarjeta.
  it('nunca pinta más del tope, y cuenta el resto', () => {
    const cargado: AgentLike = {
      ...base,
      tools: [{ toolId: 't1' }, { toolId: 't2' }, { toolId: 't3' }],
      subAgentIds: ['s1', 's2'],
      ragEnabled: true,
      ragSources: [{}, {}],
      skills: ['k1', 'k2'],
      syncStatus: 'synced',
    };
    const { chips, overflow } = agentCardChips(cargado, etiqueta);
    expect(chips.length).toBe(MAX_AGENT_CHIPS);
    expect(overflow).toBeGreaterThan(0);
  });

  it('sin nada que contar, solo queda el modelo', () => {
    const { chips, overflow } = agentCardChips(base, etiqueta);
    expect(chips.map(c => c.key)).toEqual(['model']);
    expect(overflow).toBe(0);
  });

  it('avisa cuando el RAG está encendido pero sin fuentes', () => {
    const c = agentCardChips({ ...base, ragEnabled: true, ragSources: [] }, etiqueta);
    expect(c.chips.find(x => x.key === 'rag')?.label).toBe('RAG sin fuentes');
    expect(c.chips.find(x => x.key === 'rag')?.tone).toBe('warning');
  });

  it('con fuentes, el RAG dice cuántas', () => {
    const c = agentCardChips({ ...base, ragEnabled: true, ragSources: [{}, {}] }, etiqueta);
    expect(c.chips.find(x => x.key === 'rag')?.label).toBe('RAG · 2');
    expect(c.chips.find(x => x.key === 'rag')?.tone).toBe('neutral');
  });

  // El aviso no sirve de nada si el dueño no sabe dónde ir: lleva al almacén
  // del agente, que es donde se sube el documento que falta.
  it('el aviso de RAG sin fuentes lleva al almacén del agente', () => {
    const c = agentCardChips({ ...base, _id: 'a1', ragEnabled: true, ragSources: [] }, etiqueta);
    expect(c.chips.find(x => x.key === 'rag')?.href).toBe('/dashboard/agents/a1#rag');
  });

  it('los demás chips no llevan a ningún lado', () => {
    const c = agentCardChips({ ...base, ragEnabled: true, ragSources: [{}] }, etiqueta);
    expect(c.chips.find(x => x.key === 'model')?.href).toBeUndefined();
    expect(c.chips.find(x => x.key === 'rag')?.href).toBeUndefined();
  });

  it('el RAG apagado sin fuentes no ocupa un chip', () => {
    expect(agentCardChips(base, etiqueta).chips.find(c => c.key === 'rag')).toBeUndefined();
  });

  it('singular y plural en sub-agentes y skills', () => {
    const uno = agentCardChips({ ...base, subAgentIds: ['s1'], skills: ['k1'] }, etiqueta).chips;
    expect(uno.find(c => c.key === 'subagents')?.label).toBe('1 sub-agente');
    expect(uno.find(c => c.key === 'skills')?.label).toBe('1 skill');

    const dos = agentCardChips({ ...base, subAgentIds: ['s1', 's2'], skills: ['k1', 'k2'] }, etiqueta).chips;
    expect(dos.find(c => c.key === 'subagents')?.label).toBe('2 sub-agentes');
    expect(dos.find(c => c.key === 'skills')?.label).toBe('2 skills');
  });

  it('las herramientas se resumen en vez de listarse enteras', () => {
    const c = agentCardChips(
      { ...base, tools: [{ toolId: 'uno' }, { toolId: 'dos' }, { toolId: 'tres' }] },
      etiqueta,
    );
    const chip = c.chips.find(x => x.key === 'tools');
    expect(chip?.label).toBe('3 herramientas');
  });
});
