/**
 * Verifica que widget.js / assist.js no persistan claves de launcher oculto.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = [
  { name: 'widget.js', path: path.join(root, 'public', 'widget.js') },
  { name: 'assist.js', path: path.join(root, 'public', 'assist.js') },
];

const forbiddenSetPatterns = [
  /sessionStorage\.setItem\([^)]*launcher-menu-hidden/,
  /sessionStorage\.setItem\([^)]*assist-menu-hidden/,
  /sessionStorage\.setItem\([^)]*launcher-hidden:/,
  /sessionStorage\.setItem\([^)]*assist-hidden:/,
];

let failed = 0;
for (const f of files) {
  const s = fs.readFileSync(f.path, 'utf8');
  console.log(`\n=== ${f.name} (${(s.length / 1024).toFixed(1)} KB) ===`);

  for (const re of forbiddenSetPatterns) {
    const m = s.match(re);
    if (m) {
      console.log(`FAIL: ${re} matched: ${m[0].slice(0, 120)}`);
      failed++;
    } else {
      console.log(`OK: no ${re}`);
    }
  }

  const mustRemove = f.name === 'assist.js' ? 'biv-assist-menu-hidden' : 'afhub-launcher-menu-hidden';
  if (!s.includes(`removeItem("${mustRemove}"`) && !s.includes(`removeItem('${mustRemove}'`)) {
    // minifier may use different quoting — allow if string appears with removeItem nearby
    if (!/removeItem\([^)]*menu-hidden/.test(s)) {
      console.log(`WARN: expected removeItem cleanup for menu-hidden in ${f.name}`);
    }
  }

  let i = 0;
  let pos = 0;
  while ((pos = s.indexOf('sessionStorage.setItem', pos)) !== -1 && i < 8) {
    console.log(`setItem[${i}]: ${s.slice(pos, pos + 100).replace(/\s+/g, ' ')}`);
    pos++;
    i++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll storage key checks passed.');
