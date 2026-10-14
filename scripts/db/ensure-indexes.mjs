/**
 * Crea en Mongo las colecciones e índices declarados en los schemas que falten.
 *
 * En prod la app arranca con autoIndex/autoCreate apagados (ver `mongoServerlessOptions` en
 * src/lib/db/connection.ts): un índice nuevo en un schema NO se crea solo. Correr esto tras
 * añadirlo. Nunca borra índices (usa createIndexes, no syncIndexes).
 *
 * Uso:
 *   npm run db:indexes            # crea lo que falte
 *   npm run db:indexes -- --check # solo informa, no escribe
 */
import mongoose from 'mongoose';

const checkOnly = process.argv.includes('--check');
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI no está definido');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10_000 });
await import('../../src/lib/db/models.ts');

let missing = 0;
let failed = 0;
for (const name of mongoose.modelNames().sort()) {
  const model = mongoose.model(name);
  const { toCreate } = await model.diffIndexes();
  if (!toCreate.length) continue;
  missing += toCreate.length;
  console.log(`${name} (${model.collection.collectionName}): faltan ${toCreate.length}`, JSON.stringify(toCreate));
  if (!checkOnly) {
    await model.createCollection().catch(() => {});
    try {
      await model.createIndexes();
      console.log('  → creados');
    } catch (err) {
      // Ej. índice unique con datos duplicados: se informa y se sigue con los demás modelos.
      failed += 1;
      console.error(`  → NO se pudo crear: ${err.message}`);
    }
  }
}
console.log(missing ? `${missing} índice(s) ${checkOnly ? 'faltan' : 'procesados'}.` : 'Todos los índices de los schemas existen.');
await mongoose.disconnect();
process.exit(failed ? 1 : checkOnly && missing ? 2 : 0);
