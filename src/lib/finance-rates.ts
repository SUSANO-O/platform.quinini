/**
 * Tasas de coste interno (USD/msg) — sin dependencias de servidor.
 * Compartido por plan-economics (cliente OK) y finance-aggregate (admin).
 */

/** Coste estimado por mensaje conversacional facturable (USD). Override con FINANCE_EST_USD_PER_MESSAGE */
export function estimatedUsdPerMessage(): number {
  const raw = process.env.FINANCE_EST_USD_PER_MESSAGE;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0.003;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function financeRateConfig() {
  const defaultRate = estimatedUsdPerMessage();
  return {
    defaultRate,
    flashRate: envNumber('FINANCE_EST_USD_PER_MESSAGE_FLASH', 0.0005),
    premiumRate: envNumber('FINANCE_EST_USD_PER_MESSAGE_PREMIUM', 0.004),
    ragMultiplier: envNumber('FINANCE_EST_RAG_MULTIPLIER', 1.8),
  };
}
