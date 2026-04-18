/**
 * reset-db-pre-prod.mjs
 *
 * Limpia TODOS los datos de prueba antes de salir a producción:
 *   - Subscriptions       → borradas completamente
 *   - ConversationPacks   → borradas completamente
 *   - RequestLogs         → borrados completamente
 *   - PlatformUsage       → borrados completamente
 *   - Users               → se mantienen, PERO se resetean los campos de billing
 *                           (paddleCustomerId, etc. no están en User, solo en Subscription)
 *
 * Usuarios y Widgets se CONSERVAN intencionalmente.
 * Si quieres borrar todo incluyendo usuarios, pasa el flag --wipe-users.
 *
 * Uso:
 *   node scripts/reset-db-pre-prod.mjs
 *   node scripts/reset-db-pre-prod.mjs --wipe-users
 *   node scripts/reset-db-pre-prod.mjs --dry-run
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

// Cargar .env manualmente (dotenv no es dependencia directa del proyecto)
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '../.env');
try {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
} catch { /* si no existe .env, continuar (Vercel/CI ya tienen las vars) */ }

const DRY_RUN   = process.argv.includes('--dry-run');
const WIPE_USERS = process.argv.includes('--wipe-users');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI no definida en .env');
  process.exit(1);
}

// ── Schemas mínimos (solo lo necesario para deleteMany / updateMany) ──────────

const SubscriptionSchema = new mongoose.Schema({}, { strict: false });
const ConversationPackSchema = new mongoose.Schema({}, { strict: false });
const RequestLogSchema = new mongoose.Schema({}, { strict: false });
const PlatformUsageSchema = new mongoose.Schema({}, { strict: false });
const UserSchema = new mongoose.Schema({}, { strict: false });
const WidgetSchema = new mongoose.Schema({}, { strict: false });

const Subscription     = mongoose.model('Subscription',     SubscriptionSchema);
const ConversationPack = mongoose.model('ConversationPack', ConversationPackSchema);
const RequestLog       = mongoose.model('RequestLog',       RequestLogSchema);
const PlatformUsage    = mongoose.model('PlatformUsage',    PlatformUsageSchema);
const User             = mongoose.model('User',             UserSchema);
const Widget           = mongoose.model('Widget',           WidgetSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────

function label(dry) {
  return dry ? '[DRY-RUN] Borraría' : 'Borrados';
}

async function countAndDelete(Model, filter = {}, dry = false) {
  const count = await Model.countDocuments(filter);
  if (!dry) await Model.deleteMany(filter);
  return count;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║        RESET PRE-PRODUCCIÓN — AgentFlow Landing      ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  if (DRY_RUN)    console.log('⚠️  MODO DRY-RUN — no se escribe nada en la BD\n');
  if (WIPE_USERS) console.log('⚠️  --wipe-users activo — los usuarios también serán borrados\n');

  // Confirmación manual a menos que sea dry-run
  if (!DRY_RUN) {
    const uri = MONGODB_URI.replace(/:([^@]+)@/, ':***@'); // ocultar contraseña
    console.log(`Base de datos: ${uri}\n`);
    console.log('Esta operación es IRREVERSIBLE.');
    console.log('Escribe "CONFIRMO" y presiona Enter para continuar:\n');

    const answer = await new Promise(resolve => {
      process.stdout.write('> ');
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', d => resolve(d.trim()));
    });

    if (answer !== 'CONFIRMO') {
      console.log('\nCancelado.');
      process.exit(0);
    }
    console.log();
  }

  await mongoose.connect(MONGODB_URI);
  console.log('✅  Conectado a MongoDB\n');

  const results = {};

  // 1. Subscriptions — borrar todo
  results.subscriptions = await countAndDelete(Subscription, {}, DRY_RUN);
  console.log(`${label(DRY_RUN)} ${results.subscriptions} suscripciones`);

  // 2. ConversationPacks — borrar todo
  results.packs = await countAndDelete(ConversationPack, {}, DRY_RUN);
  console.log(`${label(DRY_RUN)} ${results.packs} conversation packs`);

  // 3. RequestLogs — borrar todo
  results.logs = await countAndDelete(RequestLog, {}, DRY_RUN);
  console.log(`${label(DRY_RUN)} ${results.logs} request logs`);

  // 4. PlatformUsage — borrar todo
  results.usage = await countAndDelete(PlatformUsage, {}, DRY_RUN);
  console.log(`${label(DRY_RUN)} ${results.usage} registros de platform usage`);

  // 5. Usuarios — solo si --wipe-users
  if (WIPE_USERS) {
    results.users = await countAndDelete(User, {}, DRY_RUN);
    console.log(`${label(DRY_RUN)} ${results.users} usuarios`);

    results.widgets = await countAndDelete(Widget, {}, DRY_RUN);
    console.log(`${label(DRY_RUN)} ${results.widgets} widgets`);
  } else {
    const userCount = await User.countDocuments();
    const widgetCount = await Widget.countDocuments();
    console.log(`Conservados ${userCount} usuarios y ${widgetCount} widgets (usa --wipe-users para borrarlos)`);
  }

  console.log('\n─────────────────────────────────────────────────────');
  if (DRY_RUN) {
    console.log('DRY-RUN completado. Nada fue modificado.');
  } else {
    console.log('✅  Base de datos limpia y lista para producción.');
  }
  console.log('─────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
}

main().catch(e => {
  console.error('❌  Error:', e.message);
  process.exit(1);
});
