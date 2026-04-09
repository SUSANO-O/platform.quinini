/**
 * Lee .env, consulta Stripe (precios recurrentes activos) y escribe STRIPE_PRICE_* coherentes
 * con PLANS (19 / 49 / 129 USD → unit_amount 1900, 4900, 12900).
 * Uso: node scripts/sync-stripe-prices.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

function parseEnv(text) {
  const env = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function setEnvKey(text, key, value) {
  const lines = text.split(/\r?\n/);
  const re = new RegExp(`^${key}=`);
  let found = false;
  const out = lines.map((line) => {
    if (re.test(line.trim())) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) out.push(`${key}=${value}`);
  return out.join('\n');
}

const PLANS = [
  { key: 'STRIPE_PRICE_STARTER', cents: 1900, hints: ['starter', 'agentflow starter'] },
  { key: 'STRIPE_PRICE_GROWTH', cents: 4900, hints: ['growth'] },
  { key: 'STRIPE_PRICE_BUSINESS', cents: 12900, hints: ['business'] },
];

async function main() {
  if (!fs.existsSync(envPath)) {
    console.error('No existe .env en', envPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  const env = parseEnv(raw);
  const sk = env.STRIPE_SECRET_KEY;
  if (!sk?.startsWith('sk_')) {
    console.error('STRIPE_SECRET_KEY no válida en .env');
    process.exit(1);
  }

  const stripe = new Stripe(sk, { apiVersion: '2025-04-30.basil' });
  const prices = await stripe.prices.list({ active: true, limit: 100 });
  const recurring = prices.data.filter((p) => p.type === 'recurring' && p.recurring);

  /** @type {{ id: string; unit_amount: number | null; currency: string; product: string }}[] */
  const enriched = [];
  for (const p of recurring) {
    const pid = typeof p.product === 'string' ? p.product : p.product?.id;
    if (!pid) continue;
    const prod = await stripe.products.retrieve(pid);
    enriched.push({
      id: p.id,
      unit_amount: p.unit_amount,
      currency: p.currency,
      product: (prod.name || '').toLowerCase(),
    });
  }

  const byCents = new Map();
  for (const e of enriched) {
    if (e.unit_amount == null) continue;
    if (e.currency !== 'usd') continue;
    if (!byCents.has(e.unit_amount)) byCents.set(e.unit_amount, []);
    byCents.get(e.unit_amount).push(e);
  }

  const chosen = {};
  for (const plan of PLANS) {
    const candidates = byCents.get(plan.cents) || [];
    let pick = candidates[0];
    if (candidates.length > 1) {
      const scored = candidates.map((c) => {
        let s = 0;
        for (const h of plan.hints) {
          if (c.product.includes(h)) s += 2;
        }
        return { c, s };
      });
      scored.sort((a, b) => b.s - a.s);
      pick = scored[0].c;
    }
    if (!pick) {
      console.warn(
        `[sync-stripe-prices] No hay precio recurrente USD activo con unit_amount=${plan.cents} (${plan.key}).`,
      );
      continue;
    }
    chosen[plan.key] = pick.id;
  }

  let next = raw;
  for (const plan of PLANS) {
    const id = chosen[plan.key];
    if (id) {
      next = setEnvKey(next, plan.key, id);
      console.log(`${plan.key}=${id} (unit_amount=${plan.cents} usd)`);
    }
  }

  if (JSON.stringify(parseEnv(next)) === JSON.stringify(parseEnv(raw))) {
    console.log('Sin cambios en STRIPE_PRICE_* (ya coherentes o sin coincidencias).');
    return;
  }
  fs.writeFileSync(envPath, next, 'utf8');
  console.log('Actualizado:', envPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
