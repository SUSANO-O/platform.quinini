import { describe, expect, it } from 'vitest';
import {
  applyTabToUrl,
  buildSpreadsheetUrl,
  formatSheetToolDescription,
  parseSpreadsheetTabsFromHtml,
  sanitizeSheetName,
} from '@/lib/agent-sheets';

describe('parseSpreadsheetTabsFromHtml', () => {
  it('extrae pestañas con nombres personalizados', () => {
    const fakeBootstrap = [
      '"sheetId":0,"title":"Resumen"',
      '"sheetId":1847293,"title":"Inventario Repuestos"',
      '"sheetId":9928374,"title":"Precios 2025"',
    ].join(',');

    const tabs = parseSpreadsheetTabsFromHtml(fakeBootstrap);
    expect(tabs).toHaveLength(3);
    expect(tabs[1]).toEqual({ gid: '1847293', title: 'Inventario Repuestos' });
  });

  it('extrae pestañas del formato htmlview (items.push)', () => {
    const html = [
      'items.push({name: "inventario ventas", pageUrl: "https://docs.google.com/...", gid: "0",initialSheet: true});',
      'items.push({name: "test drive ", pageUrl: "https://docs.google.com/...", gid: "870266515",initialSheet: false});',
    ].join('');
    const tabs = parseSpreadsheetTabsFromHtml(html);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toEqual({ gid: '0', title: 'inventario ventas' });
    expect(tabs[1]).toEqual({ gid: '870266515', title: 'test drive' });
  });
});

describe('applyTabToUrl', () => {
  it('inyecta gid en la URL', () => {
    const url = 'https://docs.google.com/spreadsheets/d/abc123XYZ/edit';
    const next = applyTabToUrl(url, { gid: '42', title: 'Clientes' });
    expect(next).toBe('https://docs.google.com/spreadsheets/d/abc123XYZ/edit#gid=42');
  });
});

describe('formatSheetToolDescription', () => {
  it('combina cuándo y qué extraer', () => {
    const text = formatSheetToolDescription({
      name: 'repuestos',
      tabTitle: 'Inventario',
      description: 'Cuando pregunten por stock.',
      matrixNeed: 'Columnas SKU, stock y precio.',
    });
    expect(text).toContain('Pestaña: "Inventario"');
    expect(text).toContain('CUÁNDO USAR');
    expect(text).toContain('QUÉ NECESITAS DE LA MATRIZ');
  });
});

describe('sanitizeSheetName', () => {
  it('normaliza títulos con espacios y tildes', () => {
    expect(sanitizeSheetName('Inventario Repuestos')).toBe('inventario_repuestos');
  });
});

describe('buildSpreadsheetUrl', () => {
  it('construye URL con gid', () => {
    expect(buildSpreadsheetUrl('abc', '7')).toContain('#gid=7');
  });
});
