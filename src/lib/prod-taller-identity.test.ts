import { describe, expect, it } from 'vitest';
import {
  isSalesFaqQuestion,
  PROD_TALLER_BEHAVIOR_RULES,
  PROD_TALLER_SCHEDULED_TASKS,
  PROD_TALLER_SHORTCUTS,
  PROD_TALLER_SUB_AGENTS,
  PROD_TALLER_SYSTEM_PROMPT,
  stripSalesFaqs,
  stripSalesMcpToolIds,
  stripSalesSkills,
  stripSalesSkillsConfig,
} from './prod-taller-identity';

describe('prod-taller-identity', () => {
  it('quita skills de venta', () => {
    expect(stripSalesSkills(['sales_closer', 'memory', 'objection_handling'])).toEqual(['memory']);
  });

  it('quita FAQs de financiamiento y test drive', () => {
    expect(isSalesFaqQuestion('¿Qué requisitos necesito para financiar un vehículo?')).toBe(true);
    expect(isSalesFaqQuestion('¿Puedo probar el carro antes de comprarlo?')).toBe(true);
    expect(isSalesFaqQuestion('¿Cada cuánto cambio el aceite?')).toBe(false);
    expect(
      stripSalesFaqs([
        { question: '¿Puedo financiar?' },
        { question: '¿Hacen revisión de frenos?' },
      ]).map((f) => f.question),
    ).toEqual(['¿Hacen revisión de frenos?']);
  });

  it('atajos de bodega/repuestos, no de venta de carros', () => {
    expect(PROD_TALLER_SHORTCUTS).toHaveLength(5);
    const blob = PROD_TALLER_SHORTCUTS.map((s) => `${s.label} ${s.message}`).join(' ');
    expect(blob).not.toMatch(/financi|test drive|comprar|retoma|SUV|usado/i);
    expect(blob).toMatch(/stock|agotamiento|entrada|salida|informe/i);
    expect(PROD_TALLER_SHORTCUTS.every((s) => s.label.length <= 24)).toBe(true);
  });

  it('prompt de departamento de repuestos sin catálogo inventado', () => {
    expect(PROD_TALLER_SYSTEM_PROMPT).toMatch(/repuestos|bodega|inventario/i);
    expect(PROD_TALLER_SYSTEM_PROMPT).toMatch(/google-sheets/i);
    expect(PROD_TALLER_SYSTEM_PROMPT).not.toMatch(/No cites stock.*Este taller no tiene catálogo/i);
    expect(PROD_TALLER_BEHAVIOR_RULES.some((r) => r.id === 'prod-no-invented-stock')).toBe(true);
  });

  it('define 3 sub-agentes y 2 tareas programadas', () => {
    expect(PROD_TALLER_SUB_AGENTS.map((s) => s.key)).toEqual([
      'consultas',
      'movimientos',
      'informes',
    ]);
    expect(PROD_TALLER_SCHEDULED_TASKS.map((t) => t.name)).toEqual([
      'Informe agotamiento diario',
      'Resumen semanal bodega',
    ]);
  });

  it('limpia skillsConfig de closer y MCP HubSpot', () => {
    expect(stripSalesSkillsConfig([{ id: 'sales_closer' }, { id: 'calendar' }])).toEqual([
      { id: 'calendar' },
    ]);
    expect(
      stripSalesMcpToolIds([
        'mcp:hubspot:hubspot_create_deal',
        'mcp:landing:sheet:inventarios',
      ]),
    ).toEqual(['mcp:landing:sheet:inventarios']);
  });
});
