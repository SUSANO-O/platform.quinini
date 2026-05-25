/**
 * Auditoría de economía unitaria — LLM + RAG + infra externa (sin tiers gratis).
 * Uso: node scripts/pricing-audit.mjs
 */

const PLANS = [
  { id: 'solo',    price: 7,   conv: 300,    tier: 'flash',   rag: null, agents: 1,  history: 30 },
  { id: 'basic',   price: 17,  conv: 1500,   tier: 'flash',   rag: null, agents: 3,  history: 30 },
  { id: 'team',    price: 29,  conv: 2000,   tier: 'default', rag: { mb: 128, cap: 5 }, agents: 5, history: 45 },
  { id: 'plus',    price: 39,  conv: 3000,   tier: 'default', rag: { mb: 256, cap: 5 }, agents: 10, history: 60 },
  { id: 'starter', price: 65,  conv: 6000,   tier: 'default', rag: { mb: 1024, cap: 8 }, agents: 25, history: 90 },
  { id: 'growth',  price: 179, conv: 16_000, tier: 'default', rag: { mb: 10240, cap: 12 }, agents: 50, history: 365 },
  { id: 'business',price: 749, conv: 45_000, tier: 'premium', rag: { mb: 102400, cap: 10 }, agents: -1, history: -1 },
];

const RATES = {
  flash:   Number(process.env.FINANCE_EST_USD_PER_MESSAGE_FLASH ?? 0.0005),
  default: Number(process.env.FINANCE_EST_USD_PER_MESSAGE ?? 0.003),
  premium: Number(process.env.FINANCE_EST_USD_PER_MESSAGE_PREMIUM ?? 0.004),
  ragMult: Number(process.env.FINANCE_EST_RAG_MULTIPLIER ?? 2.0),
  ragVector: Number(process.env.FINANCE_EST_RAG_VECTOR_USD ?? 0.00008),
};

const INFRA = {
  mongoCluster: Number(process.env.FINANCE_EST_MONGO_CLUSTER_USD ?? 57),
  mongoStorageGb: Number(process.env.FINANCE_EST_MONGO_STORAGE_USD_GB ?? 0.25),
  pineconeMin: Number(process.env.FINANCE_EST_PINECONE_MIN_USD ?? 20),
  pineconeStorageGb: Number(process.env.FINANCE_EST_PINECONE_STORAGE_USD_GB ?? 0.33),
  vectorRatio: Number(process.env.FINANCE_EST_PINECONE_VECTOR_RATIO ?? 0.08),
  dupOverhead: Number(process.env.FINANCE_EST_VECTOR_DUP_OVERHEAD_PCT ?? 0.12),
  payingCustomers: Number(process.env.FINANCE_EST_PAYING_CUSTOMERS_BASE ?? 25),
  ragFill: Number(process.env.FINANCE_EST_RAG_STORAGE_FILL ?? 0.4),
  mongoOpsConv: Number(process.env.FINANCE_EST_MONGO_OPS_USD_CONV ?? 0.000012),
  historyFactor: Number(process.env.FINANCE_EST_HISTORY_STORAGE_FACTOR ?? 0.000004),
};

function costPerConv(tier, rag) {
  const base = RATES[tier];
  if (!rag) return base;
  return base * RATES.ragMult + RATES.ragVector;
}

function estimateInfra(plan) {
  const platformShare =
    (INFRA.mongoCluster + INFRA.pineconeMin) / Math.max(1, INFRA.payingCustomers);

  let mongoStorage = 0;
  let pineconeStorage = 0;
  let dupOverhead = 0;
  let ragFillGb = 0;

  if (plan.rag) {
    const agentCount = plan.agents < 0 ? plan.rag.cap : Math.min(plan.agents, plan.rag.cap);
    const maxTextGb = (plan.rag.mb / 1024) * agentCount;
    ragFillGb = maxTextGb * INFRA.ragFill;
    mongoStorage = ragFillGb * INFRA.mongoStorageGb;
    const vectorGb = ragFillGb * INFRA.vectorRatio;
    pineconeStorage = vectorGb * INFRA.pineconeStorageGb;
    dupOverhead = (mongoStorage + pineconeStorage) * INFRA.dupOverhead;
  }

  const mongoOps = plan.conv * INFRA.mongoOpsConv;
  const historyMult =
    plan.history < 0 ? 2.5 : plan.history >= 365 ? 1.8 : plan.history / 180;
  const historyOps = plan.conv * INFRA.historyFactor * historyMult;

  const total =
    platformShare + mongoStorage + pineconeStorage + dupOverhead + mongoOps + historyOps;

  return {
    platformShare,
    mongoStorage,
    pineconeStorage,
    dupOverhead,
    mongoOps,
    historyOps,
    ragFillGb,
    total,
  };
}

function estimateInfraStress(plan) {
  return estimateInfra({ ...plan, rag: plan.rag ? { ...plan.rag, cap: plan.rag.cap } : null })
    && (() => {
      const saved = INFRA.ragFill;
      INFRA.ragFill = 1.0;
      const r = estimateInfra(plan);
      INFRA.ragFill = saved;
      return r;
    })();
}

const PACKS = [
  { id: 'pack_s', price: 15,  conv: 1000 },
  { id: 'pack_m', price: 60,  conv: 5000 },
  { id: 'pack_l', price: 170, conv: 15000 },
];

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log('  AUDITORÍA DE MARGEN — BotIvA (LLM + RAG + infra externa mínima de pago)');
console.log('══════════════════════════════════════════════════════════════════════\n');

console.log('Infra fija (Atlas M10 + Pinecone pago, repartida entre clientes):');
console.log(
  `  Mongo $${INFRA.mongoCluster}/mes + Pinecone $${INFRA.pineconeMin}/mes ÷ ${INFRA.payingCustomers} clientes` +
  ` = $${((INFRA.mongoCluster + INFRA.pineconeMin) / INFRA.payingCustomers).toFixed(2)}/cliente/mes\n`,
);

console.log('Storage RAG (Mongo + Pinecone duplicado, fill ' + (INFRA.ragFill * 100) + '% del límite):');
console.log('Plan          Precio   Conv    Msgs COGS  Infra/mes   COGS total  Margen     Stress*');
console.log('─'.repeat(88));

for (const p of PLANS) {
  const cpc = costPerConv(p.tier, !!p.rag);
  const msgCogs = p.conv * cpc;
  const infra = estimateInfra(p);
  const stress = estimateInfraStress(p);
  const stressTotal = msgCogs + stress.total;
  const cogs = msgCogs + infra.total;
  const margin = p.price - cogs;
  const marginPct = ((margin / p.price) * 100).toFixed(1);
  const stressMargin = p.price - stressTotal;
  const flag =
    margin < 0 ? ' ⚠ PÉRDIDA' : Number(marginPct) < 35 ? ' ○' : ' ✓';

  console.log(
    `${p.id.padEnd(12)} $${String(p.price).padStart(3)}`.padEnd(18) +
    `${String(p.conv).padStart(7)}`.padEnd(8) +
    `$${msgCogs.toFixed(2)}`.padEnd(12) +
    `$${infra.total.toFixed(2)}`.padEnd(12) +
    `$${cogs.toFixed(2)}`.padEnd(12) +
    `$${margin.toFixed(2)} (${marginPct}%)`.padEnd(14) +
    `${stressMargin >= 0 ? '+' : ''}$${stressMargin.toFixed(0)}${flag}`,
  );
}

console.log('\n* Stress = 100% cuota RAG (cap agentes) + 100% conversaciones — peor caso escalado.');
console.log('  Infra incluye: cluster Mongo M10, Pinecone mínimo pago, storage GB, duplicado vectores,');
console.log('  logs/sesiones/historial en Mongo. Nada asumido gratis.\n');

console.log('Desglose infra (fill normal) — planes RAG:');
for (const p of PLANS.filter((x) => x.rag)) {
  const infra = estimateInfra(p);
  console.log(
    `  ${p.id}: platform $${infra.platformShare.toFixed(2)} · mongo ${infra.ragFillGb.toFixed(1)}GB $${infra.mongoStorage.toFixed(2)}` +
    ` · pinecone $${infra.pineconeStorage.toFixed(2)} · dup $${infra.dupOverhead.toFixed(2)}` +
    ` · ops $${(infra.mongoOps + infra.historyOps).toFixed(2)}`,
  );
}

console.log('\n— Packs vs planes —');
for (const pk of PACKS) {
  const ppc = pk.price / pk.conv;
  const starterPpc = 65 / 6000;
  console.log(
    `  ${pk.id}: $${pk.price}/${pk.conv} = $${ppc.toFixed(4)}/conv` +
    (ppc > starterPpc ? ' ✓ más caro que Starter' : ' ⚠ más barato que Starter'),
  );
}

console.log('\n— Benchmark mercado ($/unidad) — fuente MARKET_BENCHMARKS —');
const MARKET = [
  ...PLANS.map((p) => ({ name: `BotIvA ${p.id[0].toUpperCase()}${p.id.slice(1)}`, price: p.price, conv: p.conv, unit: 'conv' })),
  { name: 'Chatbase Hobby', price: 32, conv: 500, unit: 'crédito' },
  { name: 'Chatbase Standard', price: 120, conv: 4000, unit: 'crédito' },
  { name: 'Chatbase Pro', price: 400, conv: 15000, unit: 'crédito' },
  { name: 'SiteGPT Starter', price: 39, conv: 4000, unit: 'msg' },
  { name: 'SiteGPT Growth', price: 79, conv: 10000, unit: 'msg' },
  { name: 'SiteGPT Scale', price: 259, conv: 40000, unit: 'msg' },
  { name: 'DocsBot Personal', price: 49, conv: 5000, unit: 'msg' },
  { name: 'DocsBot Standard', price: 149, conv: 15000, unit: 'msg' },
  { name: 'DocsBot Business', price: 499, conv: 100000, unit: 'msg' },
  { name: 'CustomGPT Standard', price: 99, conv: 1000, unit: 'query' },
  { name: 'Botpress Plus', price: 189, conv: 250, unit: 'conv' },
  { name: 'Botpress Team', price: 939, conv: 1500, unit: 'conv' },
  { name: 'Lyro Core', price: 39, conv: 50, unit: 'conv IA' },
  { name: 'Lyro ~1000', price: 149, conv: 1000, unit: 'conv IA' },
];
for (const m of MARKET.sort((a, b) => a.price / a.conv - b.price / b.conv)) {
  console.log(
    `  ${m.name.padEnd(22)} $${m.price}/mes · ${m.conv} ${m.unit} → $${(m.price / m.conv).toFixed(4)}/u`,
  );
}

console.log('\nSincroniza checkout: node scripts/sync-stripe-prices.mjs\n');
