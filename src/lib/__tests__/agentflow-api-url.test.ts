import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENTFLOW_API_LOCAL_URL,
  AGENTFLOW_API_PRODUCTION_URL,
  resolveAgentflowApiUrl,
} from '@/lib/agentflow-api-url';

describe('agentflow-api-url', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it('usa API local cuando la landing es localhost', () => {
    expect(resolveAgentflowApiUrl({ landingHostname: 'localhost' })).toBe(AGENTFLOW_API_LOCAL_URL);
    expect(resolveAgentflowApiUrl({ landingHostname: '127.0.0.1' })).toBe(AGENTFLOW_API_LOCAL_URL);
  });

  it('usa API de producción cuando la landing es botiva.space', () => {
    expect(resolveAgentflowApiUrl({ landingHostname: 'botiva.space' })).toBe(
      AGENTFLOW_API_PRODUCTION_URL,
    );
    expect(resolveAgentflowApiUrl({ landingHostname: 'www.botiva.space' })).toBe(
      AGENTFLOW_API_PRODUCTION_URL,
    );
  });

  it('en deploy de producción ignora NEXT_PUBLIC_AGENTFLOW_API_URL local', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_AGENTFLOW_API_URL = 'http://127.0.0.1:4000';
    expect(resolveAgentflowApiUrl()).toBe(AGENTFLOW_API_PRODUCTION_URL);
  });

  it('en desarrollo respeta NEXT_PUBLIC_AGENTFLOW_API_URL explícita', () => {
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_AGENTFLOW_API_URL = 'http://127.0.0.1:4000';
    expect(resolveAgentflowApiUrl()).toBe('http://127.0.0.1:4000');
  });
});
