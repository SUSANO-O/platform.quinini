import { describe, expect, it } from 'vitest';
import {
  assertHonestStreamBootStatuses,
  landingBootStatusPhases,
  STREAM_BOOT_STATUS_PHASE,
} from '@/lib/widget-stream-boot-status';

describe('landingBootStatusPhases', () => {
  it('solo prepare por defecto', () => {
    expect(landingBootStatusPhases(false)).toEqual([STREAM_BOOT_STATUS_PHASE]);
  });

  it('prepare + triage si multiagente', () => {
    expect(landingBootStatusPhases(true)).toEqual(['prepare', 'triage']);
  });
});

describe('assertHonestStreamBootStatuses', () => {
  it('acepta prepare → resolve → hub del motor', () => {
    expect(assertHonestStreamBootStatuses(['prepare', 'resolve', 'hub', 'tools', 'model']).ok).toBe(true);
  });

  it('acepta prepare + triage multiagente', () => {
    expect(assertHonestStreamBootStatuses(['prepare', 'triage', 'hub']).ok).toBe(true);
  });

  it('acepta prepare → hub del motor (sin resolve intermedio)', () => {
    expect(assertHonestStreamBootStatuses(['prepare', 'hub', 'model']).ok).toBe(true);
  });

  it('rechaza rag anticipatorio tras prepare', () => {
    const r = assertHonestStreamBootStatuses(['prepare', 'rag', 'model']);
    expect(r.ok).toBe(false);
  });

  it('rechaza model anticipatorio como segundo status', () => {
    const r = assertHonestStreamBootStatuses(['prepare', 'model']);
    expect(r.ok).toBe(false);
  });

  it('exige prepare primero', () => {
    const r = assertHonestStreamBootStatuses(['hub', 'model']);
    expect(r.ok).toBe(false);
  });
});
