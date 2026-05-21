import { describe, it, expect, beforeAll } from 'vitest';

// Set env BEFORE importing the module (it reads NEXT_PUBLIC_APP_URL at load time)
beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://dashboard.example.com';
});

// Dynamic import to ensure env is set first
async function getModule() {
  const mod = await import('../widget-origin-check');
  return mod;
}

describe('isOriginAllowed', () => {
  it('allows null origin (server-to-server request)', async () => {
    const { isOriginAllowed } = await getModule();
    expect(isOriginAllowed(null, ['https://allowed.com'])).toBe(true);
  });

  it('allows any origin when list is empty (permissive mode)', async () => {
    const { isOriginAllowed } = await getModule();
    expect(isOriginAllowed('https://any-site.com', [])).toBe(true);
  });

  it('allows exact match in allowedOrigins', async () => {
    const { isOriginAllowed } = await getModule();
    expect(isOriginAllowed('https://allowed.com', ['https://allowed.com'])).toBe(true);
  });

  it('blocks origin not in allowedOrigins', async () => {
    const { isOriginAllowed } = await getModule();
    expect(isOriginAllowed('https://evil.com', ['https://allowed.com'])).toBe(false);
  });

  it('allows localhost for local embed testing even with restricted list', async () => {
    const { isOriginAllowed } = await getModule();
    expect(isOriginAllowed('http://localhost:9090', ['https://allowed.com'])).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:9090', ['https://allowed.com'])).toBe(true);
  });

  it('comparison is case-insensitive', async () => {
    const { isOriginAllowed } = await getModule();
    expect(isOriginAllowed('https://ALLOWED.COM', ['https://allowed.com'])).toBe(true);
  });

  it('strips trailing slash from origin in list', async () => {
    const { isOriginAllowed } = await getModule();
    expect(isOriginAllowed('https://allowed.com', ['https://allowed.com/'])).toBe(true);
  });

  it('allows own dashboard origin always (even when list has entries)', async () => {
    const { isOriginAllowed } = await getModule();
    expect(isOriginAllowed('https://dashboard.example.com', ['https://other.com'])).toBe(true);
  });

  it('blocks different port', async () => {
    const { isOriginAllowed } = await getModule();
    expect(isOriginAllowed('https://allowed.com:8080', ['https://allowed.com'])).toBe(false);
  });

  it('blocks http vs https', async () => {
    const { isOriginAllowed } = await getModule();
    expect(isOriginAllowed('http://allowed.com', ['https://allowed.com'])).toBe(false);
  });

  it('allows multiple origins in list', async () => {
    const { isOriginAllowed } = await getModule();
    const list = ['https://site-a.com', 'https://site-b.com', 'https://site-c.com'];
    expect(isOriginAllowed('https://site-b.com', list)).toBe(true);
  });
});

describe('resolveAllowOrigin', () => {
  it('returns origin when allowed', async () => {
    const { resolveAllowOrigin } = await getModule();
    expect(resolveAllowOrigin('https://allowed.com', ['https://allowed.com'])).toBe('https://allowed.com');
  });

  it('returns "null" string when not allowed', async () => {
    const { resolveAllowOrigin } = await getModule();
    expect(resolveAllowOrigin('https://evil.com', ['https://allowed.com'])).toBe('null');
  });

  it('returns * when origin is null and list is empty', async () => {
    const { resolveAllowOrigin } = await getModule();
    expect(resolveAllowOrigin(null, [])).toBe('*');
  });

  it('returns the request origin (not the list entry) for case normalization', async () => {
    const { resolveAllowOrigin } = await getModule();
    const result = resolveAllowOrigin('https://ALLOWED.COM', ['https://allowed.com']);
    expect(result).toBe('https://ALLOWED.COM');
  });
});
