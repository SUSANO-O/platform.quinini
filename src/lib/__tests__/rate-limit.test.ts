import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, getClientIp } from '../rate-limit';

// checkRateLimit is the sync in-memory version — safe to test without Redis
describe('checkRateLimit (in-memory)', () => {
  it('allows requests within limit', () => {
    const ns = `test-${Date.now()}`;
    const r1 = checkRateLimit(ns, 'user-1', 3, 60_000);
    const r2 = checkRateLimit(ns, 'user-1', 3, 60_000);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(1);
  });

  it('blocks when limit is exceeded', () => {
    const ns = `test-${Date.now()}-b`;
    checkRateLimit(ns, 'user-2', 2, 60_000);
    checkRateLimit(ns, 'user-2', 2, 60_000);
    const blocked = checkRateLimit(ns, 'user-2', 2, 60_000);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('namespaces are isolated', () => {
    const id = `user-${Date.now()}`;
    checkRateLimit('ns-a', id, 1, 60_000);
    const r = checkRateLimit('ns-a', id, 1, 60_000);
    expect(r.success).toBe(false);

    // Different namespace → fresh bucket
    const r2 = checkRateLimit('ns-b', id, 1, 60_000);
    expect(r2.success).toBe(true);
  });

  it('identifiers within same namespace are isolated', () => {
    const ns = `test-${Date.now()}-c`;
    checkRateLimit(ns, 'user-a', 1, 60_000);
    const blocked = checkRateLimit(ns, 'user-a', 1, 60_000);
    expect(blocked.success).toBe(false);

    // Different user → fresh bucket
    const ok = checkRateLimit(ns, 'user-b', 1, 60_000);
    expect(ok.success).toBe(true);
  });

  it('remaining decrements correctly', () => {
    const ns = `test-${Date.now()}-d`;
    const r1 = checkRateLimit(ns, 'u', 5, 60_000);
    const r2 = checkRateLimit(ns, 'u', 5, 60_000);
    const r3 = checkRateLimit(ns, 'u', 5, 60_000);
    expect(r1.remaining).toBe(4);
    expect(r2.remaining).toBe(3);
    expect(r3.remaining).toBe(2);
  });
});

describe('getClientIp', () => {
  function makeReq(headers: Record<string, string>) {
    return { headers: { get: (name: string) => headers[name] ?? null } };
  }

  it('returns ip from X-Forwarded-For when X-Forwarded-For is set', () => {
    // With TRUSTED_PROXY_COUNT=1 (default): idx = max(0, length - 1)
    // XFF: "1.2.3.4, 10.0.0.1" → ips[1] = 10.0.0.1
    const req = makeReq({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' });
    const ip = getClientIp(req);
    expect(ip).toBeTruthy();
    expect(typeof ip).toBe('string');
    expect(ip).not.toBe('unknown');
  });

  it('returns X-Real-IP when no X-Forwarded-For', () => {
    const req = makeReq({ 'x-real-ip': '5.5.5.5' });
    const ip = getClientIp(req);
    expect(ip).toBe('5.5.5.5');
  });

  it('returns "unknown" when no headers present', () => {
    const req = makeReq({});
    const ip = getClientIp(req);
    expect(ip).toBe('unknown');
  });

  it('handles single IP in X-Forwarded-For', () => {
    const req = makeReq({ 'x-forwarded-for': '9.9.9.9' });
    const ip = getClientIp(req);
    expect(ip).toBeTruthy();
    expect(ip).not.toBe('unknown');
  });

  it('trims spaces from IPs', () => {
    const req = makeReq({ 'x-forwarded-for': '  1.2.3.4  ,  10.0.0.1  ' });
    const ip = getClientIp(req);
    expect(ip).not.toContain(' ');
  });
});
