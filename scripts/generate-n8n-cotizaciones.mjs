/**
 * Regenera docs/n8n-cotizaciones-workflow.json (HTTP Request nodes, max compatibilidad n8n).
 * Run: node scripts/generate-n8n-cotizaciones.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '../docs/n8n-cotizaciones-workflow.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const mergeJsCode = `const wh = $('Webhook entrada').first().json;
const body = wh.body || wh;
const payload = body.payload || body;
const currency = String(payload.currency || payload.moneda || 'usd').toLowerCase();
const queriedAt = new Date().toISOString();

const cgRaw = $('CoinGecko SOL').first().json;
const googRaw = $('Yahoo GOOGL').first().json;
const nuRaw = $('Yahoo NU').first().json;

function parseYahoo(data, fallbackSymbol) {
  const meta = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
  if (!meta || meta.regularMarketPrice == null) {
    throw new Error('Sin cotizacion Yahoo para ' + fallbackSymbol);
  }
  const price = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose != null ? meta.chartPreviousClose : meta.previousClose;
  const changePct = prev ? ((price - prev) / prev) * 100 : null;
  return {
    simbolo: meta.symbol || fallbackSymbol,
    nombre: meta.shortName || meta.longName || fallbackSymbol,
    precio: price,
    moneda: meta.currency || 'USD',
    cierre_anterior: prev != null ? prev : null,
    cambio_dia_pct: changePct != null ? Number(changePct.toFixed(2)) : null,
    mercado: meta.fullExchangeName || meta.exchangeName || null,
    actualizado: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : queriedAt,
  };
}

const activos = [];
const errores = [];

try {
  const sol = (cgRaw && cgRaw.solana) || {};
  const chKey = currency + '_24h_change';
  activos.push({
    id: 'solana',
    nombre: 'Solana',
    tipo: 'crypto',
    simbolo: 'SOL',
    precio: sol[currency] != null ? sol[currency] : null,
    moneda: currency.toUpperCase(),
    cambio_24h_pct: sol[chKey] != null ? Number(Number(sol[chKey]).toFixed(2)) : null,
    actualizado: sol.last_updated_at
      ? new Date(sol.last_updated_at * 1000).toISOString()
      : queriedAt,
    fuente: 'CoinGecko',
  });
} catch (e) {
  errores.push({ id: 'solana', simbolo: 'SOL', error: String(e.message || e) });
}

try {
  const p = parseYahoo(googRaw, 'GOOGL');
  activos.push({
    id: 'google',
    nombre: 'Alphabet (Google)',
    tipo: 'accion',
    simbolo: p.simbolo,
    precio: p.precio,
    moneda: p.moneda,
    cambio_dia_pct: p.cambio_dia_pct,
    cierre_anterior: p.cierre_anterior,
    mercado: p.mercado,
    actualizado: p.actualizado,
    fuente: 'Yahoo Finance',
  });
} catch (e) {
  errores.push({ id: 'google', simbolo: 'GOOGL', error: String(e.message || e) });
}

try {
  const p = parseYahoo(nuRaw, 'NU');
  activos.push({
    id: 'nubank',
    nombre: 'Nubank',
    tipo: 'accion',
    simbolo: p.simbolo,
    precio: p.precio,
    moneda: p.moneda,
    cambio_dia_pct: p.cambio_dia_pct,
    cierre_anterior: p.cierre_anterior,
    mercado: p.mercado,
    actualizado: p.actualizado,
    fuente: 'Yahoo Finance',
  });
} catch (e) {
  errores.push({ id: 'nubank', simbolo: 'NU', error: String(e.message || e) });
}

function fmtPrice(a) {
  if (a.precio == null) return a.nombre + ': N/D';
  const ch = a.cambio_dia_pct != null ? a.cambio_dia_pct : a.cambio_24h_pct;
  const chStr = ch != null ? ' (' + (ch >= 0 ? '+' : '') + ch + '%)' : '';
  const prefix = a.moneda === 'USD' ? '$' : '';
  return a.nombre + ': ' + prefix + a.precio + chStr;
}

const resumenTexto = activos.length
  ? activos.map(fmtPrice).join('\\n')
  : 'No se pudieron obtener cotizaciones.';

const out = {
  ok: activos.length > 0,
  action: 'cotizaciones_tiempo_real',
  queriedAt: queriedAt,
  currency: currency,
  summary: resumenTexto.replace(/\\n/g, ' | '),
  resumenTexto: resumenTexto,
  activos: activos,
  note: 'Gratis sin API key. SOL=CoinGecko; GOOGL y NU=Yahoo Finance.',
};
if (errores.length) out.errores = errores;

return [{ json: out }];`;

function httpNode(id, name, url, x) {
  return {
    parameters: {
      method: 'GET',
      url,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'User-Agent', value: UA },
          { name: 'Accept', value: 'application/json' },
        ],
      },
      options: { timeout: 30000 },
    },
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [x, 300],
  };
}

const workflow = {
  name: 'Cotizaciones tiempo real (Solana, Nubank, Google)',
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'cotizaciones-bursatiles',
        responseMode: 'responseNode',
        options: {},
      },
      id: 'c1-webhook-in',
      name: 'Webhook entrada',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [200, 300],
      webhookId: 'cotizaciones-bursatiles-in',
    },
    httpNode(
      'c2-coingecko',
      'CoinGecko SOL',
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true',
      420,
    ),
    httpNode(
      'c3-yahoo-googl',
      'Yahoo GOOGL',
      'https://query1.finance.yahoo.com/v8/finance/chart/GOOGL?interval=1m&range=1d',
      640,
    ),
    httpNode(
      'c4-yahoo-nu',
      'Yahoo NU',
      'https://query1.finance.yahoo.com/v8/finance/chart/NU?interval=1m&range=1d',
      860,
    ),
    {
      parameters: { jsCode: mergeJsCode },
      id: 'c5-merge',
      name: 'Formatear respuesta',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1080, 300],
    },
    {
      parameters: {
        respondWith: 'json',
        responseBody: '={{ $json }}',
        options: {},
      },
      id: 'c6-webhook-out',
      name: 'Webhook salida',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1300, 300],
    },
  ],
  connections: {
    'Webhook entrada': {
      main: [[{ node: 'CoinGecko SOL', type: 'main', index: 0 }]],
    },
    'CoinGecko SOL': {
      main: [[{ node: 'Yahoo GOOGL', type: 'main', index: 0 }]],
    },
    'Yahoo GOOGL': {
      main: [[{ node: 'Yahoo NU', type: 'main', index: 0 }]],
    },
    'Yahoo NU': {
      main: [[{ node: 'Formatear respuesta', type: 'main', index: 0 }]],
    },
    'Formatear respuesta': {
      main: [[{ node: 'Webhook salida', type: 'main', index: 0 }]],
    },
  },
  active: false,
  settings: { executionOrder: 'v1' },
  meta: { templateCredsSetupCompleted: true },
};

fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2) + '\n', 'utf8');
JSON.parse(fs.readFileSync(outPath, 'utf8'));
console.log('[generate-n8n-cotizaciones] OK ->', outPath);
