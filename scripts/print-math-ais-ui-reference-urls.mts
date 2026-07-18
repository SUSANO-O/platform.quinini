/**
 * Imprime URLs públicas de capturas de referencia Math-ais.
 *   npx tsx --env-file=.env scripts/print-math-ais-ui-reference-urls.mts
 */
import { mathAisUiReferenceUrlMap } from '../src/lib/math-ais-ui-reference-manifest.ts';

const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3201').replace(/\/$/, '');
const map = mathAisUiReferenceUrlMap(base);

console.log('Referencias UI Math-ais (', base, ')\n');
for (const [id, url] of Object.entries(map)) {
  console.log(`${id}\n  ${url}\n`);
}
