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

/** Pool mínimo para Vercel: 1 socket por isolate, 0 idle. */
export function mongoServerlessOptions() {
  return {
    bufferCommands: false,
    maxPoolSize: 1,
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
