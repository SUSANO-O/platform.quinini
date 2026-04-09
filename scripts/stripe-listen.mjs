/**
 * Ejecuta: stripe listen --forward-to http://localhost:3201/api/webhooks/stripe
 * usando STRIPE_SECRET_KEY del .env (no hace falta stripe login).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { resolveStripeExecutable } from './resolve-stripe-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

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

const raw = fs.readFileSync(envPath, 'utf8');
const env = parseEnv(raw);
const sk = env.STRIPE_SECRET_KEY;
if (!sk?.startsWith('sk_')) {
  console.error('Falta STRIPE_SECRET_KEY en .env');
  process.exit(1);
}

const forward = 'http://localhost:3201/api/webhooks/stripe';
const stripeBin = resolveStripeExecutable();

const child = spawn(stripeBin, ['listen', '--forward-to', forward, '--api-key', sk], {
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => process.exit(code ?? 0));
