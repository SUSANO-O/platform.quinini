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

export function mongoServerlessOptions() {
  const onVercel = isVercelRuntime();
  return {
    bufferCommands: false,
    maxPoolSize: onVercel ? 1 : 10,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
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
