/**
 * Verifica que los bundles generados cumplan las reglas público vs interno.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const widgetPath = path.join(root, 'public', 'widget.js');
const assistPath = path.join(root, 'public', 'assist.js');

function read(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  return fs.readFileSync(p, 'utf8');
}

const widget = read(widgetPath);
const assist = read(assistPath);

const checks = [
  { name: 'widget has AgentFlowhub', ok: widget.includes('AgentFlowhub') && widget.includes('afhub-') },
  { name: 'widget has no __BIV', ok: !widget.includes('__BIV') },
  { name: 'assist has __BIV', ok: assist.includes('window.__BIV') && assist.includes('biv-') },
  { name: 'assist has no AgentFlowhub', ok: !assist.includes('AgentFlowhub') && !assist.includes('afhub-') },
  { name: 'assist exposes show/isHidden', ok: assist.includes('show:function') || assist.includes('show: function') },
];

let failed = 0;
for (const c of checks) {
  if (c.ok) {
    console.log(`[verify:widget] OK  ${c.name}`);
  } else {
    console.error(`[verify:widget] FAIL ${c.name}`);
    failed += 1;
  }
}

if (failed > 0) process.exit(1);
console.log('[verify:widget] All checks passed');
