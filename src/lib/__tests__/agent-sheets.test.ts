import { describe, expect, it } from 'vitest';
import {
  applyTabToUrl,
  buildSpreadsheetUrl,
  FIXTURE_REPUESTOS_SPREADSHEET_ID,
  formatSheetToolDescription,
  isFixtureRepuestosSheet,
  looksLikeSheetDataRow,
  parseGvizCsvChunk,
  parseSpreadsheetTabsFromHtml,
  sanitizeSheetName,
  sheetDataRowsToA1Range,
  splitSheetRowsForMongo,
  stripFixtureRepuestosSheets,
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

describe('parseGvizCsvChunk', () => {
  const csv = [
    '"REP-0000004","Eléctrico","Bombillo"',
    '"REP-0000005","Lubricantes","Aceite"',
    '"REP-0000006","Frenos","Disco"',
  ].join('\n');

  it('un chunk de continuación no pierde la primera fila (falso EOF 399)', () => {
    const { rows } = parseGvizCsvChunk(csv, false);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.[0]).toBe('REP-0000004');
    expect(rows[2]?.[0]).toBe('REP-0000006');
  });

  it('si la primera fila es un REP, no la usa como nombre de columna', () => {
    const { header, rows } = parseGvizCsvChunk(csv, true);
    expect(looksLikeSheetDataRow(['REP-0000004', 'Eléctrico'])).toBe(true);
    expect(header[0]).toBe('referencia');
    expect(rows[0]?.[0]).toBe('REP-0000004');
    expect(rows).toHaveLength(3);
  });
});

describe('sheetDataRowsToA1Range', () => {
  it('no pide columnas ZZ (truncaban el CSV del sync)', () => {
    expect(sheetDataRowsToA1Range(200, 400)).toMatch(/^A202:Z401$/);
  });
});

describe('stripFixtureRepuestosSheets', () => {
  it('quita la hoja 300k y deja otras hojas del cliente', () => {
    const tools = stripFixtureRepuestosSheets([
      { toolId: 'webhook', config: {} },
      {
        toolId: 'google-sheets',
        config: {
          sheets: [
            { url: `https://docs.google.com/spreadsheets/d/${FIXTURE_REPUESTOS_SPREADSHEET_ID}/edit` },
            { url: 'https://docs.google.com/spreadsheets/d/clienteRealInventarioXX/edit' },
          ],
        },
      },
    ]);
    expect(isFixtureRepuestosSheet({ url: `https://docs.google.com/spreadsheets/d/${FIXTURE_REPUESTOS_SPREADSHEET_ID}/edit` })).toBe(true);
    expect(tools).toHaveLength(2);
    expect(tools[1]?.config?.sheets).toHaveLength(1);
    expect(tools[1]?.config?.sheets?.[0]?.url).toContain('clienteRealInventarioXX');
  });

  it('elimina google-sheets si solo tenía la hoja fixture', () => {
    const tools = stripFixtureRepuestosSheets([
      {
        toolId: 'google-sheets',
        config: {
          sheets: [{ url: `https://docs.google.com/spreadsheets/d/${FIXTURE_REPUESTOS_SPREADSHEET_ID}/edit#gid=1` }],
        },
      },
    ]);
    expect(tools).toEqual([]);
  });
});

describe('splitSheetRowsForMongo', () => {
  it('parte por debajo del límite de 16MB', () => {
    const rows = Array.from({ length: 9000 }, (_, i) => [`REP-${i}`, 'Chevrolet']);
    const chunks = splitSheetRowsForMongo(rows, 4000);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(4000);
    expect(chunks[2]).toHaveLength(1000);
  });
});
