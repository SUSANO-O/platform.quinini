/**
 * Costes de infraestructura externa — mínimos de pago (sin asumir tiers gratis).
 * Referencia mayo 2026: Atlas M10, Pinecone Builder/serverless, storage duplicado Mongo+Pinecone.
 */

import {
  PLAN_AGENT_LIMITS,
  PLAN_CONVERSATION_LIMITS,
  PLAN_HISTORY_RETENTION_DAYS,
  PLAN_RAG_LIMITS,
  type PlanId,
} from '@/lib/plan-catalog';

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Costes mínimos mensuales de servicios externos (USD). */
export function infraRateConfig() {
  return {
    /** MongoDB Atlas M10 (mínimo con SLA; no usar M0 en proyecciones). */
    mongoClusterUsdMonth: envNumber('FINANCE_EST_MONGO_CLUSTER_USD', 57),
    /** Storage adicional Atlas (~$0.25/GB/mes). */
    mongoStorageUsdPerGb: envNumber('FINANCE_EST_MONGO_STORAGE_USD_GB', 0.25),
    /** Pinecone Builder / mínimo serverless de pago (no Starter $0). */
    pineconeMinUsdMonth: envNumber('FINANCE_EST_PINECONE_MIN_USD', 20),
    /** Storage Pinecone serverless (~$0.33/GB/mes). */
    pineconeStorageUsdPerGb: envNumber('FINANCE_EST_PINECONE_STORAGE_USD_GB', 0.33),
    /** Vectores en Pinecone ≈ % del volumen de texto RAG en Mongo (768 dims + metadata). */
    pineconeVectorGbPerTextGb: envNumber('FINANCE_EST_PINECONE_VECTOR_RATIO', 0.08),
    /** Overhead duplicar índice Mongo + Pinecone + re-indexado. */
    vectorDupOverheadPct: envNumber('FINANCE_EST_VECTOR_DUP_OVERHEAD_PCT', 0.12),
    /** Clientes de pago para repartir coste fijo de cluster (conservador: pocos clientes). */
    payingCustomersBase: envNumber('FINANCE_EST_PAYING_CUSTOMERS_BASE', 25),
    /** % de cuota RAG usada en proyección (0.4 = 40 % del límite). */
    ragStorageFillRatio: envNumber('FINANCE_EST_RAG_STORAGE_FILL', 0.4),
    /** Escrituras Mongo: logs, sesiones, widgets (~$0.000012/conv). */
    mongoOpsUsdPerConversation: envNumber('FINANCE_EST_MONGO_OPS_USD_CONV', 0.000012),
    /** Factor historial largo → más storage operacional. */
    historyStorageFactor: envNumber('FINANCE_EST_HISTORY_STORAGE_FACTOR', 0.000004),
  };
}

/** Tope de agentes para calcular storage RAG (evita ∞ en Business). */
const INFRA_AGENT_CAP: Partial<Record<PlanId, number>> = {
  team: 6,
  plus: 12,
  business: 10,
  enterprise: 15,
};

function agentCountForInfra(planId: PlanId): number {
  const limit = PLAN_AGENT_LIMITS[planId];
  const cap = INFRA_AGENT_CAP[planId] ?? 5;
  if (limit < 0) return cap;
  return Math.min(limit, cap);
}

export type PlanInfraCostBreakdown = {
  platformShareUsd: number;
  mongoStorageUsd: number;
  pineconeStorageUsd: number;
  vectorDupOverheadUsd: number;
  mongoOpsUsd: number;
  historyOpsUsd: number;
  totalUsd: number;
  assumedRagFillGb: number;
};

/**
 * Coste mensual de infra atribuible a un plan (cuota máxima de conversaciones + RAG lleno al ratio configurado).
 */
export function estimatePlanInfraUsdMonth(
  planId: PlanId,
  opts?: { ragFillRatio?: number; conversations?: number },
): PlanInfraCostBreakdown {
  const cfg = infraRateConfig();
  const fill = opts?.ragFillRatio ?? cfg.ragStorageFillRatio;
  const conversations = opts?.conversations ?? PLAN_CONVERSATION_LIMITS[planId] ?? 0;

  const platformShareUsd =
    (cfg.mongoClusterUsdMonth + cfg.pineconeMinUsdMonth) /
    Math.max(1, cfg.payingCustomersBase);

  const rag = PLAN_RAG_LIMITS[planId];
  let mongoStorageUsd = 0;
  let pineconeStorageUsd = 0;
  let vectorDupOverheadUsd = 0;
  let assumedRagFillGb = 0;

  if (rag) {
    const agents = agentCountForInfra(planId);
    const maxTextGb = (rag.mb / 1024) * agents;
    assumedRagFillGb = maxTextGb * fill;
    mongoStorageUsd = assumedRagFillGb * cfg.mongoStorageUsdPerGb;
    const vectorGb = assumedRagFillGb * cfg.pineconeVectorGbPerTextGb;
    pineconeStorageUsd = vectorGb * cfg.pineconeStorageUsdPerGb;
    vectorDupOverheadUsd =
      (mongoStorageUsd + pineconeStorageUsd) * cfg.vectorDupOverheadPct;
  }

  const mongoOpsUsd = Math.max(0, conversations) * cfg.mongoOpsUsdPerConversation;

  const historyDays = PLAN_HISTORY_RETENTION_DAYS[planId] ?? 30;
  const historyFactor =
    historyDays < 0 ? 2.5 : historyDays >= 365 ? 1.8 : historyDays / 180;
  const historyOpsUsd =
    Math.max(0, conversations) * cfg.historyStorageFactor * historyFactor;

  const totalUsd =
    platformShareUsd +
    mongoStorageUsd +
    pineconeStorageUsd +
    vectorDupOverheadUsd +
    mongoOpsUsd +
    historyOpsUsd;

  return {
    platformShareUsd: roundUsd(platformShareUsd),
    mongoStorageUsd: roundUsd(mongoStorageUsd),
    pineconeStorageUsd: roundUsd(pineconeStorageUsd),
    vectorDupOverheadUsd: roundUsd(vectorDupOverheadUsd),
    mongoOpsUsd: roundUsd(mongoOpsUsd),
    historyOpsUsd: roundUsd(historyOpsUsd),
    totalUsd: roundUsd(totalUsd),
    assumedRagFillGb: roundUsd(assumedRagFillGb),
  };
}

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}
