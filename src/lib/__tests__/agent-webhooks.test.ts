import { describe, expect, it } from 'vitest';
import {
  agentHasAnyWebhook,
  extractAgentWebhooks,
  extractWebhookEntries,
  generateWebhookId,
  sanitizeWebhookName,
} from '@/lib/agent-webhooks';

describe('sanitizeWebhookName', () => {
  it('normaliza espacios, tildes y mayúsculas a snake_case', () => {
    expect(sanitizeWebhookName('Lead Capturado')).toBe('lead_capturado');
    expect(sanitizeWebhookName('Envío Cotización')).toBe('envio_cotizacion');
  });

  it('reemplaza caracteres no [a-z0-9] por guión bajo y colapsa repeticiones', () => {
    expect(sanitizeWebhookName('lead---captured!!')).toBe('lead_captured');
    expect(sanitizeWebhookName('a/b/c')).toBe('a_b_c');
  });

  it('recorta guiones bajos al inicio/fin', () => {
    expect(sanitizeWebhookName('  -lead-  ')).toBe('lead');
  });

  it('trunca a 48 caracteres', () => {
    const long = 'a'.repeat(60);
    const out = sanitizeWebhookName(long);
    expect(out).toHaveLength(48);
    expect(out).toBe('a'.repeat(48));
  });

  it('usa fallback "webhook" para input vacío o solo símbolos', () => {
    expect(sanitizeWebhookName('')).toBe('webhook');
    expect(sanitizeWebhookName('   ')).toBe('webhook');
    expect(sanitizeWebhookName('###')).toBe('webhook');
  });
});

describe('generateWebhookId', () => {
  it('genera ids únicos con prefijo wh_', () => {
    const a = generateWebhookId();
    const b = generateWebhookId();
    expect(a).toMatch(/^wh_/);
    expect(b).toMatch(/^wh_/);
    expect(a).not.toBe(b);
  });
});

describe('extractWebhookEntries — formato nuevo (config.webhooks)', () => {
  it('extrae múltiples entradas válidas con id/name/description/url/secret/events', () => {
    const entries = extractWebhookEntries({
      webhooks: [
        {
          id: 'wh_1',
          name: 'Lead Capturado',
          description: 'Cuando el usuario deje sus datos.',
          url: 'https://example.com/hook1',
          secret: 'shh',
          events: ['Lead_Captured', ' Lead_Captured ', 'OTRO'],
        },
        {
          id: 'wh_2',
          name: 'confirm order',
          description: 'Cuando confirme la compra.',
          url: 'https://example.com/hook2',
        },
      ],
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      id: 'wh_1',
      name: 'lead_capturado',
      description: 'Cuando el usuario deje sus datos.',
      url: 'https://example.com/hook1',
      secret: 'shh',
      events: ['lead_captured', 'lead_captured', 'otro'],
    });
    expect(entries[1]).toEqual({
      id: 'wh_2',
      name: 'confirm_order',
      description: 'Cuando confirme la compra.',
      url: 'https://example.com/hook2',
    });
  });

  it('descarta entradas sin URL por defecto', () => {
    const entries = extractWebhookEntries({
      webhooks: [
        { id: 'wh_1', name: 'sin_url', description: '', url: '' },
        { id: 'wh_2', name: 'con_url', description: '', url: 'https://example.com/ok' },
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('wh_2');
  });

  it('con includeIncomplete:true conserva entradas sin URL (modo edición UI)', () => {
    const entries = extractWebhookEntries(
      { webhooks: [{ id: 'wh_1', name: 'borrador', description: '', url: '' }] },
      { includeIncomplete: true },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.url).toBe('');
  });

  it('con includeIncomplete:true devuelve array vacío tal cual si webhooks:[] (no cae a legacy)', () => {
    const entries = extractWebhookEntries(
      { webhooks: [], url: 'https://example.com/legacy-that-should-be-ignored' },
      { includeIncomplete: true },
    );
    expect(entries).toEqual([]);
  });

  it('genera id automático si la entrada no trae id', () => {
    const entries = extractWebhookEntries({
      webhooks: [{ name: 'auto_id', description: '', url: 'https://example.com/x' }],
    });
    expect(entries[0]?.id).toMatch(/^wh_/);
  });

  it('ignora entradas no-objeto dentro del array (null, string, número)', () => {
    const entries = extractWebhookEntries({
      webhooks: [null, 'oops', 42, { id: 'wh_1', name: 'valido', url: 'https://example.com/ok' }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('wh_1');
  });

  it('omite secret/events cuando vienen vacíos o inválidos', () => {
    const entries = extractWebhookEntries({
      webhooks: [
        { id: 'wh_1', name: 'x', url: 'https://example.com/x', secret: '   ', events: [] },
      ],
    });
    expect(entries[0]).not.toHaveProperty('secret');
    expect(entries[0]).not.toHaveProperty('events');
  });

  it('si webhooks:[] (todas descartadas por falta de URL) sin includeIncomplete, cae a legacy si existe url plana', () => {
    const entries = extractWebhookEntries({
      webhooks: [{ id: 'wh_1', name: 'sin_url', url: '' }],
      url: 'https://example.com/legacy-fallback',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'wh_legacy', name: 'webhook', url: 'https://example.com/legacy-fallback' });
  });
});

describe('extractWebhookEntries — formato legacy (config.url plano)', () => {
  it('normaliza a una entrada única con id wh_legacy y name webhook', () => {
    const entries = extractWebhookEntries({ url: 'https://example.com/legacy', secret: 'topsecret' });
    expect(entries).toEqual([
      {
        id: 'wh_legacy',
        name: 'webhook',
        description: 'Webhook genérico. Envía un POST JSON cuando el usuario confirme el envío de datos.',
        url: 'https://example.com/legacy',
        secret: 'topsecret',
      },
    ]);
  });

  it('sin secret no agrega la propiedad', () => {
    const entries = extractWebhookEntries({ url: 'https://example.com/legacy' });
    expect(entries[0]).not.toHaveProperty('secret');
  });

  it('recorta espacios en url y secret', () => {
    const entries = extractWebhookEntries({ url: '  https://example.com/legacy  ', secret: '  sh  ' });
    expect(entries[0]?.url).toBe('https://example.com/legacy');
    expect(entries[0]?.secret).toBe('sh');
  });
});

describe('extractWebhookEntries — inputs degenerados', () => {
  it('config null/undefined/no-objeto devuelve []', () => {
    expect(extractWebhookEntries(null)).toEqual([]);
    expect(extractWebhookEntries(undefined)).toEqual([]);
    expect(extractWebhookEntries('not-an-object')).toEqual([]);
    expect(extractWebhookEntries(42)).toEqual([]);
  });

  it('objeto sin webhooks ni url devuelve []', () => {
    expect(extractWebhookEntries({})).toEqual([]);
    expect(extractWebhookEntries({ foo: 'bar' })).toEqual([]);
  });

  it('url legacy vacía o solo espacios no genera entrada', () => {
    expect(extractWebhookEntries({ url: '   ' })).toEqual([]);
  });
});

describe('extractAgentWebhooks', () => {
  it('agrega webhooks de múltiples entradas toolId=webhook y descarta otros tipos', () => {
    const webhooks = extractAgentWebhooks({
      tools: [
        { toolId: 'google-sheets', config: { sheets: [] } },
        { toolId: 'webhook', config: { webhooks: [{ id: 'wh_1', name: 'a', url: 'https://example.com/a' }] } },
        { toolId: 'webhook', config: { url: 'https://example.com/legacy' } },
      ],
    });
    expect(webhooks).toHaveLength(2);
    expect(webhooks.map((w) => w.id)).toEqual(['wh_1', 'wh_legacy']);
  });

  it('agente sin tools devuelve []', () => {
    expect(extractAgentWebhooks({ tools: [] })).toEqual([]);
    expect(extractAgentWebhooks({})).toEqual([]);
    expect(extractAgentWebhooks(null)).toEqual([]);
    expect(extractAgentWebhooks(undefined)).toEqual([]);
  });

  it('entrada de tools sin toolId o con toolId distinto no rompe ni suma nada', () => {
    const webhooks = extractAgentWebhooks({
      tools: [{ config: { url: 'https://example.com/x' } }, { toolId: 'other', config: {} }],
    });
    expect(webhooks).toEqual([]);
  });
});

describe('agentHasAnyWebhook', () => {
  it('true cuando hay al menos un webhook con URL', () => {
    expect(
      agentHasAnyWebhook({
        tools: [{ toolId: 'webhook', config: { url: 'https://example.com/x' } }],
      }),
    ).toBe(true);
  });

  it('false cuando no hay tools, no hay webhooks, o el único webhook no tiene URL', () => {
    expect(agentHasAnyWebhook(null)).toBe(false);
    expect(agentHasAnyWebhook({ tools: [] })).toBe(false);
    expect(
      agentHasAnyWebhook({
        tools: [{ toolId: 'webhook', config: { webhooks: [{ id: 'wh_1', name: 'x', url: '' }] } }],
      }),
    ).toBe(false);
  });
});
