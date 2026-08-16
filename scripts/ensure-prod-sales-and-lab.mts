/**
 * Separa producto (preview 6a03a54c) y laboratorio (perfil admin).
 *
 *   npx tsx --env-file=.env scripts/ensure-prod-sales-and-lab.mts
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureProdSalesAndLabTaller } from '../src/lib/ensure-prod-sales-and-lab.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const report = await ensureProdSalesAndLabTaller({
  generatedJsonPath: resolve(root, 'scripts/lab-widget.generated.json'),
});

console.log(JSON.stringify(report, null, 2));
console.log('\nProducto:', `http://localhost:3201/dashboard/widget-preview?id=${report.prod.widgetId}`);
console.log('Lab admin:', `http://localhost:3201${report.lab.previewPath}`);
process.exit(0);
