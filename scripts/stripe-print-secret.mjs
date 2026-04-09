import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { resolveStripeExecutable } from './resolve-stripe-cli.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(path.join(root, '.env'), 'utf8');
const sk = raw.split(/\r?\n/).find((l) => l.startsWith('STRIPE_SECRET_KEY='))?.split('=')[1]?.trim();
if (!sk?.startsWith('sk_')) {
  console.error('Falta STRIPE_SECRET_KEY en .env');
  process.exit(1);
}

const stripeBin = resolveStripeExecutable();
const r = spawnSync(stripeBin, ['listen', '--print-secret', '--api-key', sk], {
  stdio: 'inherit',
  shell: false,
});
process.exit(r.status ?? 0);
