/**
 * Sincroniza / audita precios LemonSqueezy vs plan-catalog.ts
 *
 * Uso:
 *   node scripts/sync-lemonsqueezy-prices.mjs           # solo auditoría
 *   node scripts/sync-lemonsqueezy-prices.mjs --apply     # intenta PATCH en LS (si la API lo permite)
 *   node scripts/pricing-audit.mjs                        # economía unitaria en consola
 *
 * Requiere en .env: LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_VARIANT_*
 *
 * IMPORTANTE: Los precios canónicos están en src/lib/plan-catalog.ts — mantener alineados.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

/** Espejo de plan-catalog.ts — actualizar junto con ese archivo. */
const CATALOG = {
  subscriptions: {
    solo:    { usd: 7,   env: 'LEMONSQUEEZY_VARIANT_SOLO',    name: 'Solo' },
    basic:   { usd: 17,  env: 'LEMONSQUEEZY_VARIANT_BASIC',   name: 'Basic' },
    plus:    { usd: 39,  env: 'LEMONSQUEEZY_VARIANT_PLUS',    name: 'Plus' },
    starter: { usd: 65,  env: 'LEMONSQUEEZY_VARIANT_STARTER', name: 'Starter' },
    growth:  { usd: 179, env: 'LEMONSQUEEZY_VARIANT_GROWTH',  name: 'Growth' },
    business:{ usd: 749, env: 'LEMONSQUEEZY_VARIANT_BUSINESS', name: 'Business' },
  },
  packs: {
    pack_s: { usd: 15,  env: 'LEMONSQUEEZY_VARIANT_PACK_S', name: 'Pack S (1k conv)' },
    pack_m: { usd: 60,  env: 'LEMONSQUEEZY_VARIANT_PACK_M', name: 'Pack M (5k conv)' },
    pack_l: { usd: 145, env: 'LEMONSQUEEZY_VARIANT_PACK_L', name: 'Pack L (15k conv)' },
  },
};

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function usdToCents(usd) {
  return Math.round(usd * 100);
}

async function lsFetch(apiKey, method, urlPath, body) {
  const res = await fetch(`https://api.lemonsqueezy.com/v1${urlPath}`, {
    method,
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.errors?.[0]?.detail || JSON.stringify(json.errors || json);
    throw new Error(`${method} ${urlPath} → ${res.status}: ${detail}`);
  }
  return json;
}

async function getVariant(apiKey, variantId) {
  const json = await lsFetch(apiKey, 'GET', `/variants/${variantId}`);
  return json?.data?.attributes ?? null;
}

async function tryUpdateVariantPrice(apiKey, variantId, cents, name) {
  try {
    await lsFetch(apiKey, 'PATCH', `/variants/${variantId}`, {
      data: {
        type: 'variants',
        id: String(variantId),
        attributes: { price: cents },
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function fmtUsd(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function auditGroup(apiKey, group, apply) {
  const results = [];
  for (const [key, spec] of Object.entries(group)) {
    const variantId = process.env[spec.env] || '';
    const expectedCents = usdToCents(spec.usd);

    if (!variantId) {
      results.push({ key, name: spec.name, status: 'missing_env', env: spec.env, expected: spec.usd });
      continue;
    }

    let attrs;
    try {
      attrs = await getVariant(apiKey, variantId);
    } catch (e) {
      results.push({
        key,
        name: spec.name,
        status: 'fetch_error',
        variantId,
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    const actualCents = attrs?.price ?? null;
    const currency = (attrs?.currency || 'USD').toUpperCase();
    const match = currency === 'USD' && actualCents === expectedCents;
    const matchFormatted =
      currency !== 'USD' &&
      attrs?.price_formatted &&
      String(attrs.price_formatted).replace(/[^\d.,]/g, '');

    let applied = false;
    let applyError = null;
    if (!match && apply && currency === 'USD') {
      const r = await tryUpdateVariantPrice(apiKey, variantId, expectedCents, spec.name);
      applied = r.ok;
      applyError = r.error ?? null;
    }

    results.push({
      key,
      name: spec.name,
      variantId,
      status: match ? 'ok' : applied ? 'updated' : 'mismatch',
      expected: spec.usd,
      expectedCents,
      actualCents,
      currency,
      priceFormatted: attrs?.price_formatted ?? null,
      actualUsd: currency === 'USD' && actualCents != null ? actualCents / 100 : null,
      applyError,
      lsName: attrs?.name,
      isSubscription: attrs?.is_subscription,
    });
  }
  return results;
}

async function main() {
  const apply = process.argv.includes('--apply');

  if (!fs.existsSync(envPath)) {
    console.error('No existe .env en', envPath);
    process.exit(1);
  }

  const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
  process.env = { ...process.env, ...env };

  const apiKey = env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) {
    console.error('Falta LEMONSQUEEZY_API_KEY en .env');
    process.exit(1);
  }

  console.log('\n=== LemonSqueezy × plan-catalog.ts ===');
  console.log(apply ? 'Modo: APPLY (intentará PATCH)\n' : 'Modo: AUDIT (solo lectura)\n');

  const subs = await auditGroup(apiKey, CATALOG.subscriptions, apply);
  const packs = await auditGroup(apiKey, CATALOG.packs, apply);

  const print = (rows) => {
    for (const r of rows) {
      if (r.status === 'missing_env') {
        console.log(`⚠  ${r.name}: falta ${r.env} en .env (esperado $${r.expected})`);
        continue;
      }
      if (r.status === 'fetch_error') {
        console.log(`✗  ${r.name} (#${r.variantId}): ${r.error}`);
        continue;
      }
      const icon = r.status === 'ok' ? '✓' : r.status === 'updated' ? '↻' : '✗';
      const priceLabel =
        r.currency === 'USD'
          ? `LS ${fmtUsd(r.actualCents)}`
          : `LS ${r.priceFormatted ?? r.actualCents} (${r.currency})`;
      console.log(
        `${icon}  ${r.name} (#${r.variantId})`,
        `esperado $${r.expected} USD`,
        `→ ${priceLabel}`,
        r.lsName ? `[${r.lsName}]` : '',
      );
      if (r.currency !== 'USD') {
        console.log(`   ℹ Tienda en ${r.currency}: ajusta precios manualmente en LS o migra variantes a USD.`);
      }
      if (r.applyError) console.log(`   PATCH falló: ${r.applyError}`);
      if (r.status === 'mismatch' && !apply) {
        console.log(`   → Crea/ajusta manualmente en LS o ejecuta con --apply`);
      }
    }
  };

  console.log('— Suscripciones —');
  print(subs);
  console.log('\n— Packs one-time —');
  print(packs);

  const bad = [...subs, ...packs].filter((r) =>
    ['missing_env', 'fetch_error', 'mismatch'].includes(r.status),
  );
  console.log(`\n${bad.length === 0 ? 'Todo alineado.' : `${bad.length} item(s) requieren acción.`}`);

  if (bad.some((r) => r.status === 'missing_env')) {
    console.log('\nAjusta variantes en LS según plan-catalog.ts y vuelve a ejecutar con --apply');
  }

  process.exit(bad.length > 0 && !apply ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
