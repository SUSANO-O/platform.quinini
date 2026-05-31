/**
 * Setup completo de planes y packs en LemonSqueezy.
 *
 * Estrategia:
 *  1. Intenta CREAR productos/variantes vía API (POST /v1/products, /v1/variants).
 *     La API pública oficial NO documenta estos endpoints, pero el script los
 *     prueba por si tu store tiene acceso (algunas tiendas/admin sí lo tienen).
 *  2. Si la API rechaza (405/404/422) cae a modo guiado: imprime URLs del
 *     dashboard con valores listos para pegar.
 *  3. Tras crear (manual o vía API), lista las variantes existentes en tu
 *     store y matchea por NOMBRE para autocompletar .env con los IDs.
 *
 * Uso:
 *   node scripts/setup-lemonsqueezy-plans.mjs           # crear faltantes + audit
 *   node scripts/setup-lemonsqueezy-plans.mjs --audit   # solo auditar
 *   node scripts/setup-lemonsqueezy-plans.mjs --sync-env # solo sincronizar .env por nombre
 *   node scripts/setup-lemonsqueezy-plans.mjs --dry     # no escribe nada
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

const TRM = Number(process.env.LEMONSQUEEZY_TRM_COP || 4200);
const DRY = process.argv.includes('--dry');
const AUDIT_ONLY = process.argv.includes('--audit');
const SYNC_ENV_ONLY = process.argv.includes('--sync-env');

const PLANS = {
  subscriptions: [
    { key: 'solo',     name: 'BotIvA Solo',     usd: 7,   interval: 'month', aliases: ['solo'] },
    { key: 'team',     name: 'BotIvA Team',     usd: 29,  interval: 'month', aliases: ['team'] },
    { key: 'plus',     name: 'BotIvA Plus',     usd: 42,  interval: 'month', aliases: ['plus'] },
    { key: 'business', name: 'BotIvA Business', usd: 749, interval: 'month', aliases: ['business'] },
  ],
  packs: [
    { key: 'pack_s', name: 'Pack Conversaciones S (1.000)',  usd: 15,  interval: null, aliases: ['pack conversaciones s', 'pack s', 'pack 1000', 'pack 1.000'] },
    { key: 'pack_m', name: 'Pack Conversaciones M (5.000)',  usd: 60,  interval: null, aliases: ['pack conversaciones m', 'pack m', 'pack 5000', 'pack 5.000'] },
    { key: 'pack_l', name: 'Pack Conversaciones L (15.000)', usd: 170, interval: null, aliases: ['pack conversaciones l', 'pack l', 'pack 15000', 'pack 15.000'] },
  ],
};

const ALL_ITEMS = [...PLANS.subscriptions, ...PLANS.packs];

function usdToCopCentavos(usd) {
  return Math.round(usd * TRM * 100);
}

function fmtCop(centavos) {
  return `$${(centavos / 100).toLocaleString('es-CO')} COP`;
}

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

function envKeyForItem(item) {
  return `LEMONSQUEEZY_VARIANT_${item.key.toUpperCase()}`;
}

async function lsRequest(apiKey, method, pathSuffix, body) {
  const url = `https://api.lemonsqueezy.com/v1${pathSuffix}`;
  const headers = {
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
    Authorization: `Bearer ${apiKey}`,
  };
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(url, init);
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, ok: r.ok, json };
}

async function listAllVariants(apiKey, storeId) {
  const products = [];
  let page = 1;
  while (true) {
    const r = await lsRequest(
      apiKey,
      'GET',
      `/products?filter[store_id]=${storeId}&page[number]=${page}&page[size]=100`,
    );
    if (!r.ok) break;
    const items = r.json?.data ?? [];
    for (const p of items) {
      products.push({
        id: String(p.id),
        name: p.attributes?.name,
        status: p.attributes?.status,
        testMode: p.attributes?.test_mode,
      });
    }
    if (!r.json?.links?.next) break;
    page += 1;
  }
  const productById = new Map(products.map((p) => [p.id, p]));
  const variants = [];
  page = 1;
  while (true) {
    const r = await lsRequest(apiKey, 'GET', `/variants?page[number]=${page}&page[size]=100`);
    if (!r.ok) break;
    const items = r.json?.data ?? [];
    for (const v of items) {
      const productId = String(v.attributes?.product_id);
      const prod = productById.get(productId);
      if (!prod) continue;
      variants.push({
        id: String(v.id),
        name: v.attributes?.name,
        productId,
        productName: prod.name,
        productStatus: prod.status,
        price: v.attributes?.price,
        status: v.attributes?.status,
        interval: v.attributes?.interval,
        isSubscription: v.attributes?.is_subscription,
        testMode: v.attributes?.test_mode,
      });
    }
    if (!r.json?.links?.next) break;
    page += 1;
  }
  return variants;
}

function matchVariantForItem(variants, item) {
  const norm = (s) => (s || '').toLowerCase().trim();
  const target = norm(item.name);
  const aliases = (item.aliases || []).map(norm);
  const candidates = [target, ...aliases, norm(target.replace(/^BotIvA\s+/i, ''))];
  for (const cand of candidates) {
    const exact = variants.find((v) => norm(v.productName) === cand);
    if (exact) return exact;
  }
  for (const cand of candidates) {
    const startMatch = variants.find((v) => norm(v.productName).startsWith(cand));
    if (startMatch) return startMatch;
  }
  for (const cand of candidates) {
    const incMatch = variants.find((v) => norm(v.productName).includes(cand));
    if (incMatch) return incMatch;
  }
  return null;
}

async function tryCreateProduct(apiKey, storeId, item) {
  const cop = usdToCopCentavos(item.usd);
  const body = {
    data: {
      type: 'products',
      attributes: {
        name: item.name,
        description: `<p>${item.name}</p>`,
        price: cop,
        status: 'published',
      },
      relationships: {
        store: { data: { type: 'stores', id: String(storeId) } },
      },
    },
  };
  const r = await lsRequest(apiKey, 'POST', '/products', body);
  return r;
}

async function tryCreateVariant(apiKey, productId, item) {
  const cop = usdToCopCentavos(item.usd);
  const isSub = !!item.interval;
  const body = {
    data: {
      type: 'variants',
      attributes: {
        name: item.name,
        description: `<p>${item.name}</p>`,
        price: cop,
        is_subscription: isSub,
        interval: isSub ? item.interval : null,
        interval_count: isSub ? 1 : null,
        status: 'published',
      },
      relationships: {
        product: { data: { type: 'products', id: String(productId) } },
      },
    },
  };
  const r = await lsRequest(apiKey, 'POST', '/variants', body);
  return r;
}

function printDashboardGuide(missing) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  CREACIÓN MANUAL EN DASHBOARD — LemonSqueezy');
  console.log(`  TRM aplicada: ${TRM} COP/USD`);
  console.log('══════════════════════════════════════════════════════════════\n');
  console.log('Abre  https://app.lemonsqueezy.com/products/new  por cada plan faltante:\n');
  for (const item of missing) {
    const cop = usdToCopCentavos(item.usd);
    const tipo = item.interval ? `Subscription · Monthly` : 'Single payment';
    console.log(`• ${item.name}`);
    console.log(`    Precio: ${fmtCop(cop)}  (${item.usd} USD)`);
    console.log(`    Tipo:   ${tipo}`);
    console.log(`    Status: Published`);
    console.log(`    .env:   ${envKeyForItem(item)}=<variant_id_creado>\n`);
  }
  console.log('Cuando termines, vuelve a ejecutar:');
  console.log('   npm run setup:lemonsqueezy        (crea faltantes + audit)');
  console.log('   npm run setup:lemonsqueezy -- --sync-env   (solo lee y actualiza .env)\n');
}

async function syncEnvFromStore(apiKey, storeId, env) {
  const variants = await listAllVariants(apiKey, storeId);
  if (variants.length === 0) {
    console.log('No se encontraron variantes en el store. ¿Es el STORE_ID correcto?');
    return { changes: 0, missing: ALL_ITEMS, mismatches: [] };
  }
  const testCount = variants.filter((v) => v.testMode === true).length;
  if (testCount === variants.length) {
    console.log(`⚠  Todas las variantes son de TEST MODE (API key en test). Para producción crea una API key live.\n`);
  } else if (testCount > 0) {
    console.log(`⚠  ${testCount}/${variants.length} variantes en test_mode.\n`);
  }
  const pendingCount = variants.filter((v) => v.status === 'pending').length;
  if (pendingCount > 0) {
    console.log(`⚠  ${pendingCount}/${variants.length} variantes en status=pending — publícalas en el dashboard.\n`);
  }
  const missing = [];
  const mismatches = [];
  let raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  let changes = 0;
  console.log('── Mapeo plan → variant ──');
  for (const item of ALL_ITEMS) {
    const envKey = envKeyForItem(item);
    const current = env[envKey];
    const match = matchVariantForItem(variants, item);
    const expected = usdToCopCentavos(item.usd);
    if (!match) {
      missing.push(item);
      console.log(`✗ ${item.name.padEnd(40)} no encontrado`);
      continue;
    }
    const priceOk = match.price === expected;
    const statusOk = match.status === 'published';
    const tags = [
      priceOk ? `precio ✓` : `precio ✗ (LS=${fmtCop(match.price ?? 0)} esperado=${fmtCop(expected)})`,
      statusOk ? `status ✓` : `status ⚠=${match.status}`,
    ].join(' · ');
    console.log(`• ${item.name.padEnd(40)} variant=${String(match.id).padEnd(8)} ${tags}`);
    if (!priceOk || !statusOk) {
      mismatches.push({ item, variant: match, expected });
    }
    if (current !== match.id) {
      raw = setEnvKey(raw, envKey, match.id);
      changes += 1;
    }
  }
  if (changes > 0 && !DRY) {
    fs.writeFileSync(envPath, raw, 'utf8');
    console.log(`\nActualizado ${envPath} (${changes} variant IDs)`);
  } else if (changes > 0) {
    console.log(`\n[dry-run] habría escrito ${changes} variant IDs`);
  } else {
    console.log('\n.env ya está sincronizado.');
  }
  if (mismatches.length > 0) {
    console.log('\n── Variantes con precio o status incorrecto ──');
    for (const m of mismatches) {
      console.log(`• ${m.item.name}  →  https://app.lemonsqueezy.com/products/${m.variant.productId}/variants/${m.variant.id}/edit`);
      console.log(`    Cambia precio a ${fmtCop(m.expected)}  (${m.item.usd} USD) y publica.`);
    }
  }
  return { changes, missing, mismatches };
}

async function tryCreateMissing(apiKey, storeId, missing) {
  if (missing.length === 0) return { created: [], failed: [], apiSupported: true };

  console.log(`\nIntentando crear ${missing.length} producto(s) vía API…`);
  const created = [];
  const failed = [];
  let apiSupported = true;

  for (const item of missing) {
    if (DRY) {
      console.log(`[dry-run] crearía ${item.name}`);
      continue;
    }
    const pr = await tryCreateProduct(apiKey, storeId, item);
    if (pr.ok && pr.json?.data?.id) {
      const productId = pr.json.data.id;
      console.log(`✓ Producto creado: ${item.name}  product_id=${productId}`);
      const vr = await tryCreateVariant(apiKey, productId, item);
      if (vr.ok && vr.json?.data?.id) {
        created.push({ item, productId, variantId: vr.json.data.id });
        console.log(`  ✓ Variante creada: variant_id=${vr.json.data.id}`);
      } else {
        failed.push({ item, step: 'variant', status: vr.status, body: vr.json });
        console.log(`  ✗ Falló crear variante: HTTP ${vr.status}`);
      }
    } else {
      failed.push({ item, step: 'product', status: pr.status, body: pr.json });
      const reason = pr.json?.errors?.[0]?.detail || pr.json?.errors?.[0]?.title || `HTTP ${pr.status}`;
      console.log(`✗ ${item.name}: ${reason}`);
      if (pr.status === 404 || pr.status === 405 || pr.status === 501) {
        apiSupported = false;
        break;
      }
    }
  }
  return { created, failed, apiSupported };
}

async function main() {
  if (!fs.existsSync(envPath)) {
    console.error('No existe agent-flow-landing/.env');
    process.exit(1);
  }
  const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
  const apiKey = env.LEMONSQUEEZY_API_KEY;
  const storeId = env.LEMONSQUEEZY_STORE_ID;
  if (!apiKey || !storeId) {
    console.error('Faltan LEMONSQUEEZY_API_KEY o LEMONSQUEEZY_STORE_ID en .env');
    process.exit(1);
  }
  console.log(`Store: ${storeId} · TRM: ${TRM} COP/USD${DRY ? ' · DRY-RUN' : ''}\n`);

  if (SYNC_ENV_ONLY) {
    await syncEnvFromStore(apiKey, storeId, env);
    return;
  }

  const audit = await syncEnvFromStore(apiKey, storeId, env);
  if (AUDIT_ONLY) return;

  if (audit.missing.length === 0) {
    console.log('\nTodo presente. Nada que crear.');
    return;
  }

  const result = await tryCreateMissing(apiKey, storeId, audit.missing);

  if (!result.apiSupported || result.failed.length > 0) {
    printDashboardGuide(audit.missing.filter((m) => !result.created.find((c) => c.item.key === m.key)));
  }

  if (result.created.length > 0) {
    console.log('\nRe-sincronizando .env con los IDs nuevos…\n');
    const env2 = parseEnv(fs.readFileSync(envPath, 'utf8'));
    await syncEnvFromStore(apiKey, storeId, env2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
