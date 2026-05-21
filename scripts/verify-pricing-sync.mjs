/**
 * Verifica que todos los espejos de precios coincidan con plan-catalog.ts
 * Uso: node scripts/verify-pricing-sync.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function parsePlanCatalog(text) {
  const prices = {};
  const convs = {};
  const priceBlock = text.match(/export const PLAN_PRICES_USD[^=]*=\s*\{([^}]+)\}/s);
  const convBlock = text.match(/export const PLAN_CONVERSATION_LIMITS[^=]*=\s*\{([^}]+)\}/s);
  for (const block of [priceBlock?.[1], convBlock?.[1]]) {
    if (!block) continue;
    for (const m of block.matchAll(/(\w+)\s*:\s*([\d_]+)/g)) {
      const val = Number(m[2].replace(/_/g, ''));
      if (block === priceBlock?.[1]) prices[m[1]] = val;
      else convs[m[1]] = val;
    }
  }
  const packs = [];
  const packBlock = text.match(/export const CONVERSATION_PACKS = \[([\s\S]*?)\] as const;/);
  if (packBlock) {
    for (const m of packBlock[1].matchAll(/id:\s*'(pack_[^']+)'[\s\S]*?conversations:\s*([\d_]+)[\s\S]*?price:\s*([\d_]+)/g)) {
      packs.push({ id: m[1], conv: Number(m[2].replace(/_/g, '')), price: Number(m[3].replace(/_/g, '')) });
    }
  }
  return { prices, convs, packs };
}

function parsePricingAudit(text) {
  const plans = [];
  for (const m of text.matchAll(/\{\s*id:\s*'(solo|basic|plus|starter|growth|business)',\s*price:\s*([\d_]+),\s*conv:\s*([\d_]+)/g)) {
    plans.push({ id: m[1], price: Number(m[2].replace(/_/g, '')), conv: Number(m[3].replace(/_/g, '')) });
  }
  const packs = [];
  for (const m of text.matchAll(/\{\s*id:\s*'(pack_[^']+)',\s*price:\s*([\d_]+),\s*conv:\s*([\d_]+)/g)) {
    packs.push({ id: m[1], price: Number(m[2].replace(/_/g, '')), conv: Number(m[3].replace(/_/g, '')) });
  }
  return { plans, packs };
}

function parseLsCatalog(text) {
  const subs = {};
  for (const m of text.matchAll(/(\w+):\s*\{\s*usd:\s*([\d_]+)/g)) {
    if (['solo', 'basic', 'plus', 'starter', 'growth', 'business', 'pack_s', 'pack_m', 'pack_l'].includes(m[1])) {
      subs[m[1]] = Number(m[2].replace(/_/g, ''));
    }
  }
  return subs;
}

function parseI18nRequests(text) {
  const out = {};
  for (const m of text.matchAll(/"(\w+)":\s*\{\s*"requests":\s*"([\d.,]+)/g)) {
    out[m[1]] = Number(m[2].replace(/[.,]/g, ''));
  }
  return out;
}

const catalog = parsePlanCatalog(read('src/lib/plan-catalog.ts'));
const audit = parsePricingAudit(read('scripts/pricing-audit.mjs'));
const lsSetup = parseLsCatalog(read('scripts/setup-lemonsqueezy-plans.mjs'));
const lsSync = parseLsCatalog(read('scripts/sync-lemonsqueezy-prices.mjs'));
const esJson = parseI18nRequests(read('messages/es.json'));
const enJson = parseI18nRequests(read('messages/en.json'));

const errors = [];

for (const { id, price, conv } of audit.plans) {
  if (catalog.prices[id] !== price) errors.push(`pricing-audit.mjs ${id}: price $${price} ≠ catalog $${catalog.prices[id]}`);
  if (catalog.convs[id] !== conv) errors.push(`pricing-audit.mjs ${id}: conv ${conv} ≠ catalog ${catalog.convs[id]}`);
}

for (const { id, price, conv } of audit.packs) {
  const cp = catalog.packs.find((p) => p.id === id);
  if (!cp) errors.push(`pricing-audit.mjs pack ${id}: no existe en catalog`);
  else {
    if (cp.price !== price) errors.push(`pricing-audit.mjs ${id}: price $${price} ≠ catalog $${cp.price}`);
    if (cp.conv !== conv) errors.push(`pricing-audit.mjs ${id}: conv ${conv} ≠ catalog ${cp.conv}`);
  }
}

for (const [id, usd] of Object.entries(lsSetup)) {
  const planId = id.startsWith('pack_') ? id : id;
  const expected = planId.startsWith('pack_')
    ? catalog.packs.find((p) => p.id === planId)?.price
    : catalog.prices[planId];
  if (expected !== undefined && expected !== usd) {
    errors.push(`setup-lemonsqueezy-plans.mjs ${id}: $${usd} ≠ catalog $${expected}`);
  }
}

for (const [id, usd] of Object.entries(lsSync)) {
  const expected = id.startsWith('pack_')
    ? catalog.packs.find((p) => p.id === id)?.price
    : catalog.prices[id];
  if (expected !== undefined && expected !== usd) {
    errors.push(`sync-lemonsqueezy-prices.mjs ${id}: $${usd} ≠ catalog $${expected}`);
  }
}

for (const [id, conv] of Object.entries(esJson)) {
  if (['solo', 'basic', 'plus', 'starter', 'growth', 'business'].includes(id)) {
    if (catalog.convs[id] !== conv) errors.push(`messages/es.json ${id}: ${conv} conv ≠ catalog ${catalog.convs[id]}`);
  }
}

for (const [id, conv] of Object.entries(enJson)) {
  if (['solo', 'basic', 'plus', 'starter', 'growth', 'business'].includes(id)) {
    if (catalog.convs[id] !== conv) errors.push(`messages/en.json ${id}: ${conv} conv ≠ catalog ${catalog.convs[id]}`);
  }
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  VERIFICACIÓN DE SINCRONIZACIÓN — plan-catalog.ts');
console.log('══════════════════════════════════════════════════════════════\n');

console.log('Catálogo canónico (USD / conv/mes):');
for (const id of ['solo', 'basic', 'plus', 'starter', 'growth', 'business']) {
  console.log(`  ${id.padEnd(10)} $${String(catalog.prices[id]).padStart(3)}  ·  ${catalog.convs[id].toLocaleString('es')} conv`);
}
console.log('  Packs:');
for (const p of catalog.packs) {
  console.log(`  ${p.id.padEnd(10)} $${p.price}  ·  ${p.conv.toLocaleString('es')} conv`);
}

if (errors.length === 0) {
  console.log('\n✓ Todos los espejos están sincronizados con plan-catalog.ts\n');
  process.exit(0);
}

console.log(`\n✗ ${errors.length} desincronización(es):\n`);
for (const e of errors) console.log(`  • ${e}`);
console.log('');
process.exit(1);
