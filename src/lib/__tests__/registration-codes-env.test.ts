import { describe, it, expect } from 'vitest';
import { parseRegistrationCodesEnv, resolveEnvRegistrationPlan } from '../registration-codes-env';

describe('registration-codes-env', () => {
  it('parses CODIGO:plan pairs', () => {
    const map = parseRegistrationCodesEnv('BETA-BASIC:basic, VIP-SOLO:solo ');
    expect(map.get('BETA-BASIC')).toBe('basic');
    expect(map.get('VIP-SOLO')).toBe('solo');
  });

  it('ignores invalid plans', () => {
    const map = parseRegistrationCodesEnv('BAD:notaplan,BETA-BASIC:basic');
    expect(map.size).toBe(1);
    expect(map.get('BETA-BASIC')).toBe('basic');
  });

  it('resolveEnvRegistrationPlan reads process.env', () => {
    const prev = process.env.REGISTRATION_CODES;
    process.env.REGISTRATION_CODES = 'TEST-CODE:team';
    expect(resolveEnvRegistrationPlan('test-code')).toBe('team');
    process.env.REGISTRATION_CODES = prev;
  });
});
