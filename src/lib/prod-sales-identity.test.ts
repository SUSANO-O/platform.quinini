import { describe, expect, it } from 'vitest';
import {
  hasSheetsTool,
  hasWebhookTool,
  mergeHubspotToolIds,
  mergeSalesSkillIds,
  PROD_SALES_SHORTCUTS,
  PROD_SALES_SYSTEM_PROMPT,
} from './prod-sales-identity';

describe('prod-sales-identity', () => {
  it('prompt de ventas usa hoja, HubSpot y no inventa catálogo', () => {
    expect(PROD_SALES_SYSTEM_PROMPT).toMatch(/Sheets/i);
    expect(PROD_SALES_SYSTEM_PROMPT).toMatch(/HubSpot/i);
    expect(PROD_SALES_SYSTEM_PROMPT).toMatch(/webhook/i);
    expect(PROD_SALES_SYSTEM_PROMPT).toMatch(/No inventes/i);
    expect(PROD_SALES_SYSTEM_PROMPT).not.toMatch(/Picanto|Kia|SUV de prueba/i);
    expect(PROD_SALES_SYSTEM_PROMPT).not.toMatch(/asesor de (servicio|taller)/i);
  });

  it('atajos comerciales, no de aceite/frenos', () => {
    const blob = PROD_SALES_SHORTCUTS.map((s) => `${s.label} ${s.message}`).join(' ');
    expect(blob).toMatch(/precio|cotiz/i);
    expect(blob).toMatch(/HubSpot/i);
    expect(blob).not.toMatch(/aceite|frenos|batería/i);
    expect(PROD_SALES_SHORTCUTS.every((s) => s.label.length <= 24)).toBe(true);
  });

  it('mezcla skills de cierre sin duplicar', () => {
    expect(mergeSalesSkillIds(['memory', 'sales_closer'])).toEqual([
      'memory',
      'sales_closer',
      'objection_handling',
      'lead_qualifier',
    ]);
  });

  it('añade tools HubSpot al catálogo MCP', () => {
    const ids = mergeHubspotToolIds(['mcp:sheets:read']);
    expect(ids[0]).toBe('mcp:sheets:read');
    expect(ids).toContain('mcp:hubspot:hubspot_create_contact');
  });

  it('detecta hoja y webhook en tools', () => {
    expect(hasSheetsTool([{ toolId: 'google-sheets' }, { toolId: 'webhook' }])).toBe(true);
    expect(hasWebhookTool([{ toolId: 'webhook' }])).toBe(true);
    expect(hasSheetsTool([{ toolId: 'webhook' }])).toBe(false);
  });
});
