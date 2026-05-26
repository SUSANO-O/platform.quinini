import { describe, it, expect } from 'vitest';
import {
  parseRegistrationCodesEnv,
  resolveEnvRegistrationPlan,
  resolveEnvRegistrationCode,
  normalizeTrialDays,
} from '../registration-codes-env';

describe('registration-codes-env', () => {
  it('parses CODIGO:plan pairs with default trial days', () => {
    const map = parseRegistrationCodesEnv('BETA-BASIC:basic, VIP-SOLO:solo ');
    expect(map.get('BETA-BASIC')).toEqual({ plan: 'basic', trialDays: 7 });
    expect(map.get('VIP-SOLO')).toEqual({ plan: 'solo', trialDays: 7 });
  });

  it('parses optional trial days as third segment', () => {
    const map = parseRegistrationCodesEnv('TAM1:team:30,BETA:basic:15');
    expect(map.get('TAM1')).toEqual({ plan: 'team', trialDays: 30 });
    expect(map.get('BETA')).toEqual({ plan: 'basic', trialDays: 15 });
  });

  it('ignores invalid plans', () => {
    const map = parseRegistrationCodesEnv('BAD:notaplan,BETA-BASIC:basic');
    expect(map.size).toBe(1);
    expect(map.get('BETA-BASIC')?.plan).toBe('basic');
  });

  it('normalizeTrialDays clamps range', () => {
    expect(normalizeTrialDays(0)).toBe(1);
    expect(normalizeTrialDays(500)).toBe(365);
    expect(normalizeTrialDays('40')).toBe(40);
  });

  it('resolveEnvRegistrationCode reads process.env', () => {
    const prev = process.env.REGISTRATION_CODES;
    process.env.REGISTRATION_CODES = 'TEST-CODE:team:10';
    expect(resolveEnvRegistrationPlan('test-code')).toBe('team');
    expect(resolveEnvRegistrationCode('test-code')).toEqual({ plan: 'team', trialDays: 10 });
    process.env.REGISTRATION_CODES = prev;
  });
});
