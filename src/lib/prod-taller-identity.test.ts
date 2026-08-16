import { describe, expect, it } from 'vitest';
import {
  isSalesFaqQuestion,
  PROD_TALLER_SHORTCUTS,
  stripSalesFaqs,
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

  it('atajos de taller, no de venta de carros', () => {
    expect(PROD_TALLER_SHORTCUTS).toHaveLength(5);
    const blob = PROD_TALLER_SHORTCUTS.map((s) => `${s.label} ${s.message}`).join(' ');
    expect(blob).not.toMatch(/financi|test drive|comprar|retoma|SUV|usado/i);
    expect(blob).toMatch(/aceite/i);
    expect(blob).toMatch(/cita/i);
    expect(PROD_TALLER_SHORTCUTS.every((s) => s.label.length <= 24)).toBe(true);
  });

  it('limpia skillsConfig de closer', () => {
    expect(stripSalesSkillsConfig([{ id: 'sales_closer' }, { id: 'calendar' }])).toEqual([
      { id: 'calendar' },
    ]);
  });
});
