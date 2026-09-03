/**
 * Verifica el circuito completo del outbox de webhooks CONTRA PRODUCCIÓN,
 * sin tocar la configuración de ningún agente ni afectar leads reales.
 *
 * Inserta una fila sintética (payload de prueba, marcada con __verificacion)
 * apuntando a httpbin, observa cómo el worker de cron-schendule la procesa en
 * sus /tick, y la borra al terminar.
 *
 * Fase 1 — destino 503: debe reintentar, subir attempts y reprogramar a +1 min.
 * Fase 2 — destino 200: debe marcarla `sent`.
 *
 *   npx tsx --env-file=.env scripts/verify-webhook-outbox.mts
 *   npx tsx --env-file=.env scripts/verify-webhook-outbox.mts --limpiar   (solo borrar restos)
 */
import { createConnection } from 'mongoose';

const COL = 'webhookoutbox';
const MARK = '__verificacion_outbox';
const URL_FALLA = 'https://httpbin.org/status/503';
const URL_OK = 'https://httpbin.org/status/200';
const SOLO_LIMPIAR = process.argv.includes('--limpiar');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Falta MONGODB_URI');
const c = await createConnection(uri).asPromise();
const col = c.db!.collection(COL);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function limpiar() {
  const { deletedCount } = await col.deleteMany({ [MARK]: true });
  console.log(`limpieza: ${deletedCount} fila(s) de prueba borradas`);
}

if (SOLO_LIMPIAR) {
  await limpiar();
  await c.close();
  process.exit(0);
}

await limpiar(); // por si quedó algo de una corrida anterior

/** Espera hasta que la fila cumpla la condición, o se agote el tiempo. */
async function esperar(
  id: unknown,
  cond: (d: Record<string, unknown>) => boolean,
  etiqueta: string,
  maxSegundos = 300,
): Promise<Record<string, unknown> | null> {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < maxSegundos) {
    const d = await col.findOne({ _id: id as never });
    if (d && cond(d)) return d;
    await sleep(5_000);
    process.stdout.write('.');
  }
  console.log(`\n  ⏱ timeout esperando: ${etiqueta}`);
  return null;
}

console.log('\n── Fase 1: destino que falla (503) → debe reintentar ──');
const ins = await col.insertOne({
  [MARK]: true,
  tenantId: 'verificacion',
  agentId: 'verificacion-outbox',
  event: 'lead_captured',
  webhookName: 'verificacion',
  url: URL_FALLA,
  payload: { event: 'lead_captured', lead: { email: 'verificacion@example.com' }, [MARK]: true },
  status: 'pending',
  attempts: 0,
  nextRetryAt: new Date(),
  lockedAt: null,
  lastStatus: 503,
  lastError: 'siembra de verificación',
  createdAt: new Date(),
  updatedAt: new Date(),
});
const id = ins.insertedId;
console.log(`  fila sembrada (${String(id).slice(-8)}), esperando al worker…`);

const trasFallo = await esperar(id, (d) => (d.attempts as number) >= 1, 'attempts >= 1');
if (!trasFallo) {
  console.log('\n❌ El worker no procesó la fila. ¿Está corriendo el /tick de cron-schendule?');
  await limpiar();
  await c.close();
  process.exit(1);
}
const esperaMin = (new Date(trasFallo.nextRetryAt as Date).getTime() - Date.now()) / 60_000;
console.log('\n  ✅ reintento programado:', {
  attempts: trasFallo.attempts,
  status: trasFallo.status,
  lastStatus: trasFallo.lastStatus,
  lockLiberado: trasFallo.lockedAt === null,
  proximoIntentoEnMin: Math.round(esperaMin * 10) / 10,
});

console.log('\n── Fase 2: destino sano (200) → debe entregar ──');
await col.updateOne({ _id: id }, { $set: { url: URL_OK, nextRetryAt: new Date() } });
console.log('  destino cambiado a 200 y adelantado, esperando al worker…');

const trasExito = await esperar(id, (d) => d.status === 'sent', "status === 'sent'", 300);
if (!trasExito) {
  console.log('\n❌ El worker no llegó a entregarla.');
  await limpiar();
  await c.close();
  process.exit(1);
}
console.log('\n  ✅ entregada:', {
  status: trasExito.status,
  lastStatus: trasExito.lastStatus,
  attempts: trasExito.attempts,
  sentAt: trasExito.sentAt,
});

await limpiar();
await c.close();
console.log('\n✅ Circuito del outbox verificado de punta a punta.\n');
