import { afterEach, describe, expect, it } from 'vitest';
import {
  canReuseMongoConnection,
  isVercelRuntime,
  markMongoConnectFailed,
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
