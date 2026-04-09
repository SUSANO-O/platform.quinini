/**
 * Crea en Stripe un endpoint de webhook dedicado a agent-flow-landing
 * (ruta /api/webhooks/stripe). El otro webhook de otra app no se toca.
 *
 * Requisitos:
 * - URL pública HTTPS (Vercel, etc.). Stripe NO permite localhost aquí.
 * - En local usa: stripe listen --forward-to http://localhost:3201/api/webhooks/stripe
 *
 * Uso:
 *   node scripts/create-stripe-webhook.mjs https://tu-app.vercel.app
 *   node scripts/create-stripe-webhook.mjs   # usa STRIPE_WEBHOOK_PUBLIC_URL o NEXT_PUBLIC_APP_URL del .env
 *
 * Si tiene éxito, imprime whsec_... y opcionalmente actualiza STRIPE_WEBHOOK_SECRET en .env
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

const EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.trial_will_end',
];

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

function normalizeBaseUrl(u) {
  return u.replace(/\/+$/, '');
}

function toWebhookUrl(base) {
  const b = normalizeBaseUrl(base);
  if (b.endsWith('/api/webhooks/stripe')) return b;
  return `${b}/api/webhooks/stripe`;
}

async function main() {
  const argUrl = process.argv[2];

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

  let base =
    argUrl ||
    env.STRIPE_WEBHOOK_PUBLIC_URL ||
    env.NEXT_PUBLIC_APP_URL ||
    '';
  base = base.trim();

  if (!base) {
    console.error(
      'Pasa la URL base HTTPS de la landing, o define STRIPE_WEBHOOK_PUBLIC_URL / NEXT_PUBLIC_APP_URL en .env\n' +
        'Ejemplo: node scripts/create-stripe-webhook.mjs https://mi-landing.vercel.app',
    );
    process.exit(1);
  }

  if (/localhost|127\.0\.0\.1/i.test(base)) {
    console.error(
      'Stripe no registra webhooks hacia localhost.\n' +
        'En local ejecuta en otra terminal:\n' +
        '  stripe listen --forward-to http://localhost:3201/api/webhooks/stripe\n' +
        'y pega el whsec_... que muestra la CLI en STRIPE_WEBHOOK_SECRET.',
    );
    process.exit(1);
  }

  if (!base.startsWith('https://')) {
    console.error('La URL debe ser HTTPS (obligatorio para webhooks en Stripe).');
    process.exit(1);
  }

  const fullUrl = toWebhookUrl(base);
  const stripe = new Stripe(sk, { apiVersion: '2025-04-30.basil' });

  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const duplicate = existing.data.find((e) => e.url === fullUrl);
  if (duplicate) {
    console.error(
      `Ya existe un endpoint con la misma URL:\n  ${fullUrl}\n` +
        `ID: ${duplicate.id}\n` +
        'Stripe no muestra el signing secret por API en listados. ' +
        'Abre Developers → Webhooks → ese endpoint → Resumen → Reveal (whsec_...).',
    );
    process.exit(0);
  }

  const created = await stripe.webhookEndpoints.create({
    url: fullUrl,
    enabled_events: EVENTS,
    description: 'AgentFlow Landing — suscripciones (api/webhooks/stripe)',
  });

  const secret = created.secret;
  if (!secret) {
    console.error('Respuesta sin secret; revisa el Dashboard de Stripe.');
    process.exit(1);
  }

  console.log('\n✓ Webhook creado en Stripe (modo de la clave sk_test / sk_live).');
  console.log('  URL:', fullUrl);
  console.log('  ID:', created.id);
  console.log('\nSigning secret (solo se muestra esta vez):');
  console.log(secret);
  console.log('\nActualizando STRIPE_WEBHOOK_SECRET en .env ...\n');

  const next = setEnvKey(raw, 'STRIPE_WEBHOOK_SECRET', secret);
  fs.writeFileSync(envPath, next, 'utf8');
  console.log('Listo:', envPath);
  console.log('\nReinicia el servidor (npm run dev) para cargar el nuevo whsec.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
