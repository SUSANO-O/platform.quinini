/**
 * Costes LLM — tarifas API Gemini y estimaciones alineadas con factura GCP (may 2026).
 * Fuente única para admin/model-stats, finance-rates y plan-economics.
 *
 * Calibración observada: ~$48,78 / ~13,9M tokens ≈ $3,51 / 1M tokens;
 * ~$0,017 / conversación facturable (mix Pro + Gemini 3 Flash).
 */

export type ModelTier = 'flash' | 'default' | 'premium';

export type TokenRatesUsdPer1M = { input: number; output: number };

/** USD por 1M tokens — referencia Google AI / Vertex (may 2026). */
export const GEMINI_API_USD_PER_1M: Record<string, TokenRatesUsdPer1M> = {
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-2.5-flash':      { input: 0.30, output: 2.50 },
  'gemini-3.1-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-3-flash':        { input: 0.50, output: 3.00 },
  'gemini-3.1-flash':      { input: 0.50, output: 3.00 },
  'gemini-3.5-flash':      { input: 0.50, output: 3.00 },
  'gemini-2.5-pro':        { input: 1.25, output: 10.00 },
  'gemini-3-pro':          { input: 1.25, output: 10.00 },
  'gemini-3.1-pro':        { input: 1.25, output: 10.00 },
};

/** Blend factura GCP cuando el modelo no está en la tabla. */
export const INVOICE_BLEND_USD_PER_1M = 3.51;

/** Tokens típicos por petición (prompt + RAG + respuesta). */
export const TOKENS_PER_REQUEST: Record<ModelTier, { input: number; output: number }> = {
  flash:   { input: 1_200, output: 350 },
  default: { input: 2_000, output: 550 },
  premium: { input: 2_800, output: 750 },
};

/** USD / petición observado (factura GCP, sin créditos) — fallback rápido por tier. */
export const OBSERVED_USD_PER_REQUEST: Record<ModelTier, number> = {
  flash:   0.001,
  default: 0.006,
  premium: 0.017,
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function invoiceBlendUsdPer1M(): number {
  return envNumber('FINANCE_INVOICE_USD_PER_1M', INVOICE_BLEND_USD_PER_1M);
}

export function observedUsdPerRequest(tier: ModelTier): number {
  const key =
    tier === 'flash'
      ? 'FINANCE_OBSERVED_USD_PER_REQUEST_FLASH'
      : tier === 'premium'
        ? 'FINANCE_OBSERVED_USD_PER_REQUEST_PREMIUM'
        : 'FINANCE_OBSERVED_USD_PER_REQUEST_DEFAULT';
  return envNumber(key, OBSERVED_USD_PER_REQUEST[tier]);
}

export function classifyModelTier(modelId: string): ModelTier {
  const m = modelId.toLowerCase().replace(/^(vx\/|hf\/)/, '');
  if (
    m.includes('pro') ||
    m.includes('ultra') ||
    m.includes('claude') ||
    m.includes('gpt-4') ||
    m.includes('gpt-5') ||
    m.includes('sonnet') ||
    m.includes('opus') ||
    m.includes('72b') ||
    m.includes('70b')
  ) return 'premium';
  if (
    m.includes('flash-lite') ||
    m.includes('2.5-flash') ||
    m.includes('2.0-flash') ||
    m.includes('mini') ||
    m.includes('nano') ||
    m.includes('small') ||
    m.includes('lite')
  ) return 'flash';
  if (m.includes('flash')) return 'default';
  return 'default';
}

function matchRateKey(modelId: string): string | null {
  const m = modelId.toLowerCase().replace(/^(vx\/|hf\/)/, '');
  const keys = Object.keys(GEMINI_API_USD_PER_1M).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (m.includes(key) || m === key) return key;
  }
  return null;
}

export function getTokenRatesForModel(modelId: string): TokenRatesUsdPer1M {
  const key = matchRateKey(modelId);
  if (key) return GEMINI_API_USD_PER_1M[key];
  const tier = classifyModelTier(modelId);
  if (tier === 'premium') return GEMINI_API_USD_PER_1M['gemini-2.5-pro'];
  if (tier === 'flash') return GEMINI_API_USD_PER_1M['gemini-2.5-flash'];
  return GEMINI_API_USD_PER_1M['gemini-3-flash'];
}

export function usdFromTokenCounts(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = getTokenRatesForModel(modelId);
  const usd = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
  return Math.round(usd * 10000) / 10000;
}

export function estimatedTokensForRequests(modelId: string, requests: number): {
  input: number;
  output: number;
  total: number;
} {
  const tier = classifyModelTier(modelId);
  const t = TOKENS_PER_REQUEST[tier];
  return {
    input: Math.round(requests * t.input),
    output: Math.round(requests * t.output),
    total: Math.round(requests * (t.input + t.output)),
  };
}

/**
 * Coste USD para N peticiones.
 * Con tokens reales → tarifa API del modelo; sin ellos → tokens estimados × tarifa API.
 */
export function estimateRequestCostUsd(
  modelId: string,
  requests: number,
  realInputTokens = 0,
  realOutputTokens = 0,
): number {
  if (realInputTokens + realOutputTokens > 0) {
    return usdFromTokenCounts(modelId, realInputTokens, realOutputTokens);
  }
  if (requests <= 0) return 0;
  const est = estimatedTokensForRequests(modelId, requests);
  return usdFromTokenCounts(modelId, est.input, est.output);
}

/** Alias histórico usado en plan-economics. */
export const TOKENS_PER_MESSAGE = TOKENS_PER_REQUEST;

export function geminiCostPerMessage(modelId: string, tier?: ModelTier): number {
  const t = tier ?? classifyModelTier(modelId);
  const tok = TOKENS_PER_REQUEST[t];
  return usdFromTokenCounts(modelId, tok.input, tok.output);
}
