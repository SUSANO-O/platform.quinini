/**
 * Imprime auditoría de economía unitaria (plan-catalog + finance-aggregate).
 * Uso: node scripts/pricing-audit.mjs
 */

/** Espejo de plan-catalog.ts + finance defaults */
const PLANS = [
  { id: 'solo',    price: 7,   conv: 300,    tier: 'flash',   rag: false },
  { id: 'basic',   price: 17,  conv: 1500,   tier: 'flash',   rag: false },
  { id: 'plus',    price: 36,  conv: 3000,   tier: 'default', rag: true  },
  { id: 'starter', price: 54,  conv: 6000,   tier: 'default', rag: true  },
  { id: 'growth',  price: 139, conv: 16_000, tier: 'default', rag: true  },
  { id: 'business',price: 449, conv: 45_000, tier: 'premium', rag: true  },
];

const RATES = {
  flash:   Number(process.env.FINANCE_EST_USD_PER_MESSAGE_FLASH ?? 0.0005),
  default: Number(process.env.FINANCE_EST_USD_PER_MESSAGE ?? 0.003),
  premium: Number(process.env.FINANCE_EST_USD_PER_MESSAGE_PREMIUM ?? 0.004),
  ragMult: Number(process.env.FINANCE_EST_RAG_MULTIPLIER ?? 1.8),
};

const GEMINI = {
  flash: { in: 0.30, out: 2.50, tokens: { in: 350, out: 100 } },
  pro:   { in: 1.25, out: 10.0, tokens: { in: 750, out: 200 } },
};

function costPerConv(tier, rag) {
  const base = RATES[tier];
  return rag ? base * RATES.ragMult : base;
}

function geminiCost(tier, model) {
  const g = model === 'pro' ? GEMINI.pro : GEMINI.flash;
  const t = model === 'pro' ? GEMINI.pro.tokens : GEMINI.flash.tokens;
  return (t.in * g.in + t.out * g.out) / 1_000_000;
}

const PACKS = [
  { id: 'pack_s', price: 15,  conv: 1000 },
  { id: 'pack_m', price: 60,  conv: 5000 },
  { id: 'pack_l', price: 145, conv: 15000 },
];

const MARKET = [
  ...PLANS.map((p) => ({ name: `MatIAs ${p.id[0].toUpperCase()}${p.id.slice(1)}`, price: p.price, conv: p.conv })),
  { name: 'Chatbase Hobby',   price: 32,  conv: 500 },
  { name: 'Chatbase Standard',price: 120, conv: 4000 },
  { name: 'Tidio Starter',    price: 24,  conv: 100 },
  { name: 'Tidio Growth',     price: 49,  conv: 250 },
];

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  AUDITORÍA DE MARGEN — MatIAs (plan-catalog.ts)');
console.log('══════════════════════════════════════════════════════════════\n');

console.log('Tasas internas (finance-aggregate):');
console.log(`  flash $${RATES.flash}/msg · default $${RATES.default}/msg · premium $${RATES.premium}/msg · RAG ×${RATES.ragMult}\n`);

console.log('Coste API Gemini (referencia, 1 msg/tur):');
console.log(`  Flash ~$${geminiCost('flash', 'flash').toFixed(5)} · Pro ~$${geminiCost('premium', 'pro').toFixed(5)}\n`);

console.log('Plan          Precio   Conv    $/conv   COGS max*   Margen max   Break-even');
console.log('─'.repeat(78));

for (const p of PLANS) {
  const cpc = costPerConv(p.tier, p.rag);
  const cogs = p.conv * cpc;
  const margin = p.price - cogs;
  const marginPct = ((margin / p.price) * 100).toFixed(1);
  const breakEven = Math.min(100, ((p.price / cogs) * 100)).toFixed(1);
  const flag = margin < 0 ? ' ⚠ PÉRDIDA' : marginPct < 50 ? ' ○' : ' ✓';

  console.log(
    `${p.id.padEnd(12)} $${String(p.price).padStart(3)}`.padEnd(18) +
    `${String(p.conv).padStart(7)}`.padEnd(8) +
    `$${(p.price / p.conv).toFixed(4)}`.padEnd(9) +
    `$${cogs.toFixed(2)}`.padEnd(12) +
    `$${margin.toFixed(2)} (${marginPct}%)`.padEnd(14) +
    `${breakEven}%${flag}`,
  );
}

console.log('\n* COGS max = 100% de cuota usada con tier asumido + RAG si aplica.');
console.log('  En la práctica el margen es mayor: uso medio ~30-50%, no todos en tier premium.\n');

console.log('— Packs vs planes —');
for (const pk of PACKS) {
  const ppc = pk.price / pk.conv;
  const starterPpc = 54 / 6000;
  console.log(
    `  ${pk.id}: $${pk.price}/${pk.conv} = $${ppc.toFixed(4)}/conv` +
    (ppc > starterPpc ? ' ✓ más caro que Starter' : ' ⚠ más barato que Starter'),
  );
}

console.log('\n— Benchmark mercado ($/conversación) —');
for (const m of MARKET.sort((a, b) => a.price / a.conv - b.price / b.conv)) {
  console.log(`  ${m.name.padEnd(20)} $${m.price}/mes · ${m.conv} conv → $${(m.price / m.conv).toFixed(4)}/conv`);
}

console.log('\n— Recomendaciones de cuota de modelos —');
console.log('  free/solo/basic  → solo Flash (minPlan: free)');
console.log('  plus/starter     → Flash + modelos default (minPlan: starter)');
console.log('  growth           → + Pro (minPlan: growth)');
console.log('  business         → todos (minPlan: business)\n');
