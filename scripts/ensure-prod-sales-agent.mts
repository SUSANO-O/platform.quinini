/**
 * Gemelo comercial del Taller (Sheets + HubSpot + webhooks).
 *
 *   npx tsx --env-file=.env scripts/ensure-prod-sales-agent.mts
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureProdSalesAgent } from '../src/lib/ensure-prod-sales-agent.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const report = await ensureProdSalesAgent({
  generatedJsonPath: resolve(root, 'scripts/sales-widget.generated.json'),
});

console.log(JSON.stringify(report, null, 2));
console.log('\nVentas (Limarle):', `http://localhost:3201${report.sales.previewPath}`);
process.exit(0);
