import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENTFLOW_API_PRODUCTION_URL, getAgentflowApiOriginsForCsp } from '../agentflow-api-url';

describe('orígenes de la CSP', () => {
  it('en producción no permite localhost, sí el API real', () => {
    const prod = getAgentflowApiOriginsForCsp({ production: true });
    expect(prod).toContain(new URL(AGENTFLOW_API_PRODUCTION_URL).origin);
    expect(prod.some((o) => /localhost|127\.0\.0\.1/.test(o))).toBe(false);
  });

  it('en desarrollo sigue permitiendo el API local', () => {
    const dev = getAgentflowApiOriginsForCsp({ production: false });
    expect(dev).toContain('http://127.0.0.1:4000');
  });

  it('next.config no permite el dominio de Vercel retirado (control-BotIvA.vercel.app)', () => {
    const cfg = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
    expect(cfg.toLowerCase()).not.toContain('control-botiva.vercel.app');
  });
});
