import { describe, expect, it } from 'vitest';
import {
  canReuseMongoConnection,
  markMongoConnectFailed,
  mongoServerlessOptions,
} from '../db/connection';

describe('mongoServerlessOptions', () => {
  it('no retiene conexiones idle (Vercel)', () => {
    const opts = mongoServerlessOptions();
    expect(opts.minPoolSize).toBe(0);
    expect(opts.maxPoolSize).toBe(1);
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
