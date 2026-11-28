// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Conversación por voz del widget: dictado en tiempo real (PCM 16 kHz a ElevenLabs), interrupción
 * sin confundir el eco del agente con el usuario, y lectura que arranca mientras llega la respuesta.
 * Se ejecutan las funciones reales de core.js.
 */
const core = readFileSync(join(process.cwd(), 'scripts/widget/core.js'), 'utf8');
function fnSource(name: string): string {
  const start = core.indexOf(`    function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const end = core.indexOf('\n    }\n', start);
  return core.slice(start, end + '\n    }\n'.length);
}
function load<T>(names: string[], ret: string): T {
  // eslint-disable-next-line no-new-func
  return new Function(`${names.map(fnSource).join('\n')}; return ${ret};`)() as T;
}

const downsampleToPcm16 = load<(i: Float32Array, a: number, b: number) => Int16Array>(['downsampleToPcm16'], 'downsampleToPcm16');
const int16ToBase64 = load<(p: Int16Array) => string>(['int16ToBase64'], 'int16ToBase64');
const { isLikelyEcho, shouldBargeIn } = load<{
  isLikelyEcho: (h: string, s: string) => boolean;
  shouldBargeIn: (h: string, s: string) => boolean;
}>(['isLikelyEcho', 'shouldBargeIn'], '{ isLikelyEcho, shouldBargeIn }');
type Feeder = { feed: (t: string) => void; finish: (t: string) => string; reset: () => void; active: () => boolean };
const createStreamSpeechFeeder = load<(clean: (t: string) => string, enq: (p: string) => void) => Feeder>(
  ['createStreamSpeechFeeder', 'ttsCleanText'],
  'createStreamSpeechFeeder',
);
const ttsCleanText = load<(t: string) => string>(['ttsCleanText'], 'ttsCleanText');

describe('audio del micrófono → PCM 16 kHz', () => {
  it('48 kHz → 16 kHz: un tercio de muestras, valores en rango', () => {
    const input = new Float32Array(4800).map((_, i) => Math.sin(i / 10));
    const out = downsampleToPcm16(input, 48000, 16000);
    expect(out.length).toBe(1600);
    expect(Math.max(...out)).toBeLessThanOrEqual(32767);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(-32768);
  });
  it('recorta picos y no rompe con vacío', () => {
    const out = downsampleToPcm16(new Float32Array([2, -2]), 16000, 16000);
    expect(Array.from(out)).toEqual([32767, -32768]);
    expect(downsampleToPcm16(new Float32Array(0), 48000, 16000).length).toBe(0);
  });
  it('base64 little-endian correcto', () => {
    expect(int16ToBase64(new Int16Array([1, -1]))).toBe(Buffer.from([1, 0, 255, 255]).toString('base64'));
  });
});

describe('eco del agente vs. el usuario hablando', () => {
  const spoken = 'Tu camioneta está en la Avenida Boyacá con calle 80, detenida hace diez minutos.';
  it('lo que dice el agente, oído por el micrófono, es eco', () => {
    expect(isLikelyEcho('tu camioneta está en la avenida boyacá', spoken)).toBe(true);
    expect(shouldBargeIn('tu camioneta está en la avenida', spoken)).toBe(false);
  });
  it('el usuario diciendo otra cosa interrumpe', () => {
    expect(shouldBargeIn('espera, mejor dime la moto', spoken)).toBe(true);
  });
  it('una sola palabra o ruido no interrumpe', () => {
    expect(shouldBargeIn('eh', spoken)).toBe(false);
    expect(shouldBargeIn('', spoken)).toBe(false);
  });
  it('sin lectura en curso nada es eco', () => {
    expect(isLikelyEcho('sí', '')).toBe(false);
  });
});

describe('lectura mientras llega la respuesta', () => {
  function run(chunks: string[], final: string) {
    const pieces: string[] = [];
    const f = createStreamSpeechFeeder(ttsCleanText, (p) => pieces.push(p));
    let acc = '';
    const firstAt: number[] = [];
    chunks.forEach((c, i) => {
      acc += c;
      const before = pieces.length;
      f.feed(acc);
      if (pieces.length > before && !firstAt.length) firstAt.push(i);
    });
    const rest = f.finish(final);
    return { pieces, rest, firstAt: firstAt[0] };
  }

  it('la primera frase sale antes de que termine el stream y no se repite nada', () => {
    const final = 'Tu camioneta está en Bogotá. Recorrió 42 km hoy y está detenida. ¿Quieres ver la ruta?';
    const { pieces, rest, firstAt } = run(
      ['Tu camioneta ', 'está en Bogotá. ', 'Recorrió 42 km ', 'hoy y está detenida. ', '¿Quieres ver la ruta?'],
      final,
    );
    // Sale con el fragmento siguiente al punto (espera el espacio: no corta "3.5"), bastante antes del final.
    expect(firstAt).toBeLessThanOrEqual(2);
    expect(pieces[0]).toBe('Tu camioneta está en Bogotá.');
    const all = [...pieces, rest].join(' ').replace(/\s+/g, ' ').trim();
    expect(all).toBe(ttsCleanText(final));
  });

  it('no corta números con punto decimal', () => {
    const { pieces } = run(['El consumo fue de 3.', '5 litros por hora en la ruta de hoy, más o menos'], 'x');
    expect(pieces).toEqual([]);
  });

  it('respuesta corta sin puntos: todo se lee al final', () => {
    const { pieces, rest } = run(['Hola', ' qué tal'], 'Hola qué tal');
    expect(pieces).toEqual([]);
    expect(rest).toBe('Hola qué tal');
  });

  it('si el texto final cambia (markdown que se cierra), no se pierde ni se duplica el inicio', () => {
    const pieces: string[] = [];
    const f = createStreamSpeechFeeder(ttsCleanText, (p) => pieces.push(p));
    f.feed('Tu vehículo está en movimiento ahora mismo. Va a **60');
    f.feed('Tu vehículo está en movimiento ahora mismo. Va a **60 km/h** por la autopista.');
    const rest = f.finish('Tu vehículo está en movimiento ahora mismo. Va a **60 km/h** por la autopista.');
    expect(pieces).toEqual(['Tu vehículo está en movimiento ahora mismo.']);
    expect(rest).toBe('Va a 60 km/h por la autopista.');
  });

  it('reset: el turno siguiente empieza limpio', () => {
    const pieces: string[] = [];
    const f = createStreamSpeechFeeder(ttsCleanText, (p) => pieces.push(p));
    f.feed('Déjame revisar los datos de tu flota. ');
    f.reset();
    expect(f.active()).toBe(false);
    expect(f.finish('Tienes 3 vehículos.')).toBe('Tienes 3 vehículos.');
  });
});

describe('core.js: cableado', () => {
  it('startListening usa primero el tiempo real y stopVoice lo cierra', () => {
    expect(fnSource('startListening')).toMatch(/realtimeSttCapable\(\)\) \{ startListeningRealtime\(\); return; \}/);
    expect(fnSource('stopVoice')).toContain('stopRealtimeStt()');
  });
  it('el micrófono pide cancelación de eco y la key nunca está en el widget', () => {
    expect(fnSource('startListeningRealtime')).toContain('echoCancellation: true');
    expect(core).toContain("/api/widget/voice/realtime-token");
    expect(core).not.toMatch(/xi-api-key/);
  });
  it('dictado nativo: espera el silencio en vez de enviar el primer "final"', () => {
    const src = fnSource('_doStartRecognition');
    expect(src).toContain('NATIVE_TURN_SILENCE_MS');
    expect(src).not.toMatch(/if \(event\.results\[i\]\.isFinal\) final \+=/);
  });
});
