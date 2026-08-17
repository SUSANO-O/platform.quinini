/**
 * Aplica configuración de departamento de repuestos al Asesor de Taller (prod preview).
 *
 *   npx tsx --env-file=.env scripts/ensure-prod-taller-repuestos.mts
 */
import { ensureProdTallerRepuestos } from '../src/lib/ensure-prod-taller-repuestos.ts';

const report = await ensureProdTallerRepuestos();
console.log(JSON.stringify(report, null, 2));
