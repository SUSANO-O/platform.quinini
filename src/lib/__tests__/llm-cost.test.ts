/**
 * Tests puros de `llm-cost.ts` — clasificación de modelos y aritmética de coste.
 * Se apoya en las constantes exportadas por el propio módulo para no quedar
 * atado a tarifas concretas (que cambian con las facturas).
 */
import { describe, expect, it } from 'vitest';
import {
  classifyModelTier,
  estimateRequestCostUsd,
  estimatedTokensForRequests,
  geminiCostPerMessage,
  getTokenRatesForModel,
  GEMINI_API_USD_PER_1M,
  INVOICE_BLEND_USD_PER_1M,
  TOKENS_PER_REQUEST,
  usdFromInvoiceBlend,
  usdFromTokenCounts,
} from '@/lib/llm-cost';

describe('classifyModelTier', () => {
  it('marca como premium los modelos "pro" / grandes / de razonamiento', () => {
    for (const m of ['gemini-2.5-pro', 'gemini-3-pro', 'claude-sonnet-5', 'gpt-5-mini-pro', 'deepseek-v4-pro', 'llama-70b']) {
      expect(classifyModelTier(m)).toBe('premium');
    }
  });

  it('marca como flash los lite / mini / nano / 2.x-flash', () => {
    for (const m of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'some-mini', 'tiny-nano', 'deepseek-v4-flash']) {
      expect(classifyModelTier(m)).toBe('flash');
    }
  });

  it('cualquier variante "flash" cae en flash o default, nunca premium', () => {
    for (const m of ['gemini-3-flash', 'gemini-3.5-flash', 'gemini-3.1-flash']) {
      expect(['flash', 'default']).toContain(classifyModelTier(m));
    }
  });

  it('modelo desconocido → default', () => {
    expect(classifyModelTier('modelo-que-no-existe')).toBe('default');
  });

  it('ignora los prefijos vx/ y hf/', () => {
    expect(classifyModelTier('vx/gemini-2.5-pro')).toBe('premium');
    expect(classifyModelTier('hf/some-mini')).toBe('flash');
  });
});

describe('getTokenRatesForModel', () => {
  it('devuelve la tarifa exacta cuando el id contiene una clave conocida', () => {
    expect(getTokenRatesForModel('gemini-2.5-pro')).toEqual(GEMINI_API_USD_PER_1M['gemini-2.5-pro']);
    expect(getTokenRatesForModel('vertex/gemini-2.5-flash-lite')).toEqual(
      GEMINI_API_USD_PER_1M['gemini-2.5-flash-lite'],
    );
  });

  it('cae a una tarifa por tier cuando el modelo es desconocido', () => {
    const premium = getTokenRatesForModel('modelo-pro-desconocido');
    expect(premium).toEqual(GEMINI_API_USD_PER_1M['gemini-2.5-pro']);
    const flash = getTokenRatesForModel('modelo-mini-desconocido');
    expect(flash).toEqual(GEMINI_API_USD_PER_1M['gemini-2.5-flash']);
  });
});

describe('usdFromTokenCounts', () => {
  it('aplica tarifa input/output y redondea a 4 decimales', () => {
    const rates = GEMINI_API_USD_PER_1M['gemini-2.5-flash'];
    const got = usdFromTokenCounts('gemini-2.5-flash', 1_000_000, 1_000_000);
    expect(got).toBeCloseTo(rates.input + rates.output, 4);
  });

  it('0 tokens → 0 USD', () => {
    expect(usdFromTokenCounts('gemini-2.5-pro', 0, 0)).toBe(0);
  });

  it('escala linealmente con el volumen', () => {
    const a = usdFromTokenCounts('gemini-2.5-pro', 500_000, 500_000);
    const b = usdFromTokenCounts('gemini-2.5-pro', 1_000_000, 1_000_000);
    expect(b).toBeCloseTo(a * 2, 4);
  });
});

describe('estimatedTokensForRequests', () => {
  it('multiplica los tokens/petición del tier por el nº de peticiones', () => {
    const t = TOKENS_PER_REQUEST.flash;
    expect(estimatedTokensForRequests('gemini-2.5-flash', 10)).toEqual({
      input: t.input * 10,
      output: t.output * 10,
      total: (t.input + t.output) * 10,
    });
  });

  it('0 peticiones → todo 0', () => {
    expect(estimatedTokensForRequests('gemini-2.5-pro', 0)).toEqual({ input: 0, output: 0, total: 0 });
  });
});

describe('usdFromInvoiceBlend', () => {
  it('usa el blend por defecto ($/1M) sobre el total de tokens', () => {
    expect(usdFromInvoiceBlend(1_000_000)).toBeCloseTo(INVOICE_BLEND_USD_PER_1M, 4);
    expect(usdFromInvoiceBlend(0)).toBe(0);
  });
});

describe('estimateRequestCostUsd', () => {
  const IN = 1_000_000;
  const OUT = 1_000_000;

  it("modo 'api' usa solo la tarifa del modelo", () => {
    const got = estimateRequestCostUsd('gemini-2.5-pro', 0, IN, OUT, 'api');
    expect(got).toBeCloseTo(usdFromTokenCounts('gemini-2.5-pro', IN, OUT), 4);
  });

  it("modo 'invoice' usa solo el blend de factura", () => {
    const got = estimateRequestCostUsd('gemini-2.5-pro', 0, IN, OUT, 'invoice');
    expect(got).toBeCloseTo(usdFromInvoiceBlend(IN + OUT), 4);
  });

  it("modo 'realistic' (default) nunca baja del blend de factura", () => {
    const realistic = estimateRequestCostUsd('gemini-2.5-flash-lite', 0, IN, OUT);
    const invoice = estimateRequestCostUsd('gemini-2.5-flash-lite', 0, IN, OUT, 'invoice');
    expect(realistic).toBeGreaterThanOrEqual(invoice);
  });

  it('cuando no hay tokens reales, estima a partir del nº de peticiones', () => {
    const got = estimateRequestCostUsd('gemini-2.5-flash', 100);
    expect(got).toBeGreaterThan(0);
  });
});

describe('geminiCostPerMessage', () => {
  it('un mensaje premium cuesta más que uno flash', () => {
    expect(geminiCostPerMessage('gemini-2.5-pro')).toBeGreaterThan(
      geminiCostPerMessage('gemini-2.5-flash-lite'),
    );
  });
});
