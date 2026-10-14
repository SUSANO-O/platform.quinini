import { afterEach, describe, expect, it } from 'vitest';
import {
  canReuseMongoConnection,
  isManagedProdRuntime,
  isVercelRuntime,
  markMongoConnectFailed,
  MONGO_MAX_IDLE_MS,
  mongoServerlessOptions,
} from '../db/connection';

describe('mongoServerlessOptions', () => {
  const originalVercel = process.env.VERCEL;

  afterEach(() => {
    process.env.VERCEL = originalVercel;
  });

  it('en Vercel: pool de 1 socket, sin idle (un isolate = ~1 request a la vez)', () => {
    process.env.VERCEL = '1';
    expect(isVercelRuntime()).toBe(true);
    const opts = mongoServerlessOptions();
    expect(opts.minPoolSize).toBe(0);
    expect(opts.maxPoolSize).toBe(1);
    expect(opts.bufferCommands).toBe(false);
  });

  it('fuera de Vercel (Docker/Cloud Run, proceso persistente): pool > 1 para no serializar requests concurrentes', () => {
    process.env.VERCEL = undefined;
    delete process.env.VERCEL;
    expect(isVercelRuntime()).toBe(false);
    const opts = mongoServerlessOptions();
    expect(opts.maxPoolSize).toBeGreaterThan(1);
    expect(opts.bufferCommands).toBe(false);
  });
});

describe('mongoServerlessOptions — sockets ociosos', () => {
  it('descarta sockets ociosos (evita colgarse en uno muerto tras congelar la función)', () => {
    for (const vercel of ['1', undefined]) {
      if (vercel) process.env.VERCEL = vercel;
      else delete process.env.VERCEL;
      const opts = mongoServerlessOptions();
      expect(opts.maxIdleTimeMS).toBe(MONGO_MAX_IDLE_MS);
      // Debe ser menor que el hueco de inactividad que disparaba el cuelgue (≥5 min).
      expect(opts.maxIdleTimeMS).toBeLessThan(5 * 60_000);
      expect(opts.maxIdleTimeMS).toBeGreaterThan(0);
    }
  });
});

describe('canReuseMongoConnection', () => {
  it('solo reutiliza readyState connected (1)', () => {
    expect(canReuseMongoConnection(1)).toBe(true);
    expect(canReuseMongoConnection(0)).toBe(false);
    expect(canReuseMongoConnection(2)).toBe(false);
    expect(canReuseMongoConnection(3)).toBe(false);
    expect(canReuseMongoConnection(undefined)).toBe(false);
  });
});

describe('markMongoConnectFailed', () => {
  it('limpia conn y promise para que el siguiente request reintente', () => {
    const cache = { conn: { fake: true }, promise: Promise.resolve(null) };
    markMongoConnectFailed(cache);
    expect(cache.conn).toBeNull();
    expect(cache.promise).toBeNull();
  });
});

describe('mongoServerlessOptions — sin crear colecciones/índices al arrancar en prod', () => {
  const original = { VERCEL: process.env.VERCEL, K_SERVICE: process.env.K_SERVICE };

  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('en Vercel: autoIndex y autoCreate apagados (no encolar 138 órdenes delante del chat)', () => {
    process.env.VERCEL = '1';
    delete process.env.K_SERVICE;
    expect(isManagedProdRuntime()).toBe(true);
    const opts = mongoServerlessOptions();
    expect(opts.autoIndex).toBe(false);
    expect(opts.autoCreate).toBe(false);
  });

  it('en Cloud Run (K_SERVICE): también apagados', () => {
    delete process.env.VERCEL;
    process.env.K_SERVICE = 'platform-quinini';
    expect(isManagedProdRuntime()).toBe(true);
    const opts = mongoServerlessOptions();
    expect(opts.autoIndex).toBe(false);
    expect(opts.autoCreate).toBe(false);
    expect(opts.maxPoolSize).toBeGreaterThan(1);
  });

  it('en local/Docker: se mantienen (el Mongo local crea sus índices solo)', () => {
    delete process.env.VERCEL;
    delete process.env.K_SERVICE;
    expect(isManagedProdRuntime()).toBe(false);
    const opts = mongoServerlessOptions();
    expect(opts.autoIndex).toBe(true);
    expect(opts.autoCreate).toBe(true);
  });
});
