import { afterEach, describe, expect, it } from 'vitest';
import { getVoiceProvider, __resetVoiceProviderForTests } from '@/lib/voice/provider';
import { ElevenLabsVoiceProvider } from '@/lib/voice/providers/elevenlabs-provider';

const ORIGINAL_ENV = { ...process.env };

describe('getVoiceProvider (factory)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    __resetVoiceProviderForTests();
  });

  it('sin VOICE_PROVIDER en el env, usa ElevenLabs por defecto', () => {
    delete process.env.VOICE_PROVIDER;
    expect(getVoiceProvider()).toBeInstanceOf(ElevenLabsVoiceProvider);
  });

  it('con VOICE_PROVIDER=elevenlabs explícito, usa ElevenLabs', () => {
    process.env.VOICE_PROVIDER = 'elevenlabs';
    expect(getVoiceProvider()).toBeInstanceOf(ElevenLabsVoiceProvider);
  });

  it('con un proveedor desconocido, cae a ElevenLabs (fallback seguro, no rompe)', () => {
    process.env.VOICE_PROVIDER = 'un-proveedor-que-no-existe-todavia';
    expect(getVoiceProvider()).toBeInstanceOf(ElevenLabsVoiceProvider);
  });

  it('cachea la instancia — llamadas repetidas devuelven el mismo objeto', () => {
    expect(getVoiceProvider()).toBe(getVoiceProvider());
  });

  it('__resetVoiceProviderForTests limpia la caché', () => {
    const first = getVoiceProvider();
    __resetVoiceProviderForTests();
    const second = getVoiceProvider();
    expect(first).not.toBe(second);
  });
});
