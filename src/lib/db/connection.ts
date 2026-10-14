import dns from 'dns';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI ?? '';

/** En Windows algunos DNS del ISP rechazan querySrv (mongodb+srv://). */
function configureMongoDns(): void {
  const custom = process.env.MONGODB_DNS_SERVERS?.trim();
  if (custom) {
    dns.setServers(custom.split(',').map((s) => s.trim()).filter(Boolean));
    return;
  }
  if (process.platform === 'win32') {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  }
}

/**
 * En Vercel cada isolate atiende ~1 request a la vez → pool de 1 socket alcanza y
 * evita conexiones ociosas. Pero este MISMO módulo también corre en un proceso
 * Node persistente (Docker local, Cloud Run) que sí atiende varios requests
 * concurrentes sobre el mismo proceso — ahí un pool de 1 serializa TODAS las
 * queries Mongo de TODOS los requests concurrentes entre sí, sin importar cuánta
 * CPU sobre. Confirmado con una prueba de carga real: bajo concurrencia=5, el
 * motor MCP (aparte, en otro servicio) procesaba cada request en ~11-15s en
 * paralelo genuino, pero el cliente veía 25-56s — la demora estaba acá, antes de
 * siquiera reenviar el request al motor.
 */
export function isVercelRuntime(): boolean {
  return process.env.VERCEL === '1';
}

/**
 * Sockets ociosos más viejos que esto se descartan al pedirlos del pool y se abre
 * uno nuevo. Sin esto, tras congelarse la función (Vercel entre requests, Cloud Run
 * con CPU throttled) la red olvida la conexión TCP pero el driver la sigue creyendo
 * viva: el primer request después de ≥5 min quieto se colgaba ~7,8 s en la fase
 * `auth` (medido en prod: 100 % de esos turnos). Reconectar en la misma región
 * cuesta cientos de ms.
 */
export const MONGO_MAX_IDLE_MS = 30_000;

/** Vercel o Cloud Run (`K_SERVICE` lo define Cloud Run). Docker/dev local: false. */
export function isManagedProdRuntime(): boolean {
  return isVercelRuntime() || Boolean(process.env.K_SERVICE);
}

/**
 * En prod Mongoose NO crea colecciones ni índices al arrancar. Con `autoCreate`/`autoIndex`
 * cada instancia nueva mandaba 36 `create` + 102 `createIndexes` (ya existentes) y, con el
 * pool de 1 socket de Vercel, las queries del chat esperaban detrás: ~8-9 s de preparación
 * en cada arranque en frío (medido con `npm run bench:db-cold`: 18,7 s → 0,6 s en 8 queries).
 * Índice nuevo en un schema → crearlo con `npm run db:indexes`.
 */
export function mongoServerlessOptions() {
  const onVercel = isVercelRuntime();
  const managed = isManagedProdRuntime();
  return {
    bufferCommands: false,
    maxPoolSize: onVercel ? 1 : 10,
    minPoolSize: 0,
    maxIdleTimeMS: MONGO_MAX_IDLE_MS,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    autoIndex: !managed,
    autoCreate: !managed,
  } as const;
}

export function canReuseMongoConnection(readyState: number | undefined | null): boolean {
  return readyState === 1;
}

export function markMongoConnectFailed(cache: { conn: unknown; promise: unknown }): void {
  cache.conn = null;
  cache.promise = null;
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) throw new Error('MONGODB_URI no está definido');

  if (cached.conn && canReuseMongoConnection(cached.conn.connection.readyState)) {
    return cached.conn;
  }
  if (cached.conn) {
    markMongoConnectFailed(cached);
  }

  if (!cached.promise) {
    configureMongoDns();
    cached.promise = mongoose.connect(MONGODB_URI, mongoServerlessOptions());
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    markMongoConnectFailed(cached);
    throw err;
  }
}
