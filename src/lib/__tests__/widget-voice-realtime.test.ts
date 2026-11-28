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
    // Sale cuando ya llegó texto después de la primera frase (estable), antes del final.
    expect(firstAt).toBeLessThanOrEqual(3);
    expect(pieces.length).toBe(1); // solo la primera frase se adelanta; el resto, del texto final
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

describe('core.js: no cortar al que habla y no "borrar" la respuesta', () => {
  it('el widget cierra el turno: commit manual al callar y respaldo si ElevenLabs no responde', () => {
    const src = fnSource('startListeningRealtime');
    expect(src).toContain('createVoiceActivityDetector(');
    expect(src).toMatch(/onEnd: function\(\) \{[\s\S]*sendChunk\(new Int16Array\(160\), true\)/);
    expect(src).toMatch(/commitFallback = setTimeout\([\s\S]*finishTurn\(lastPartial\)/);
  });

  it('hablar encima del agente lo pausa ya; si era eco/ruido, reanuda', () => {
    const src = fnSource('startListeningRealtime');
    expect(src).toMatch(/onStart: function\(\) \{[\s\S]*ttsPausePlayback\(\)[\s\S]*ttsResumePlayback\(\)/);
    expect(src).toContain('confirmBargeIn()');
  });

  it('token_reset ya no borra la burbuja: la atenúa y la respuesta real la reemplaza', () => {
    const i = core.indexOf("evt.type === 'token_reset'");
    const block = core.slice(i, core.indexOf("evt.type === 'done'", i));
    expect(block).toContain("classList.add('afhub-msg--superseded')");
    expect(block).not.toContain('removeBotMessage(streamBubble)');
    expect(core).toContain("streamBubble.classList.remove('afhub-msg--superseded');");
  });
});

describe('detector de voz local', () => {
  const createVAD = load<(o: { startMs?: number; endMs?: number; onStart?: () => void; onEnd?: () => void }) => {
    push: (s: Float32Array, ms: number) => { speaking: boolean };
    speaking: () => boolean;
  }>(['createVoiceActivityDetector'], 'createVoiceActivityDetector');
  const frame = (amp: number, seed = 1) => {
    const a = new Float32Array(1024);
    let x = seed;
    for (let i = 0; i < a.length; i++) { x = (x * 16807) % 2147483647; a[i] = amp * ((x / 2147483647) * 2 - 1); }
    return a;
  };
  function feed(v: ReturnType<typeof createVAD>, amp: number, ms: number) {
    for (let t = 0; t < ms; t += 85) v.push(frame(amp, t + 7), 85);
  }

  it('voz normal: empieza y termina tras ~1,1 s de silencio', () => {
    const ev: string[] = [];
    const v = createVAD({ onStart: () => ev.push('start'), onEnd: () => ev.push('end') });
    feed(v, 0.002, 1000); // ambiente silencioso
    feed(v, 0.15, 1500);  // habla
    expect(ev).toEqual(['start']);
    feed(v, 0.002, 600);  // pausa corta para pensar: NO corta
    expect(ev).toEqual(['start']);
    feed(v, 0.15, 800);
    feed(v, 0.002, 1300);
    expect(ev).toEqual(['start', 'end']);
  });

  it('voz baja (relajada) también cuenta como voz', () => {
    const ev: string[] = [];
    const v = createVAD({ onStart: () => ev.push('start') });
    feed(v, 0.002, 1000);
    feed(v, 0.02, 600);
    expect(ev).toEqual(['start']);
  });

  it('con ruido de fondo constante: detecta el fin del turno igual (antes quedaba colgado)', () => {
    const ev: string[] = [];
    const v = createVAD({ onStart: () => ev.push('start'), onEnd: () => ev.push('end') });
    feed(v, 0.03, 3000);  // ventilador / calle
    expect(ev).toEqual([]);
    feed(v, 0.25, 1500);  // habla por encima del ruido
    feed(v, 0.03, 1500);  // vuelve solo el ruido
    expect(ev).toEqual(['start', 'end']);
  });

  it('un golpe corto no es voz', () => {
    const ev: string[] = [];
    const v = createVAD({ onStart: () => ev.push('start') });
    feed(v, 0.002, 1000);
    feed(v, 0.3, 85);
    feed(v, 0.002, 500);
    expect(ev).toEqual([]);
  });
});

describe('frase a medias: esperar más antes de enviar', () => {
  const looksIncomplete = load<(t: string) => boolean>(['looksIncompleteUtterance'], 'looksIncompleteUtterance');
  it('casos reales de Navi App (2026-11-28) se reconocen como incompletos', () => {
    expect(looksIncomplete('Sí, sí, el código es, el código es el siguiente: XCH')).toBe(true);
    expect(looksIncomplete('Oye, quiero arreglar otro vehículo, el')).toBe(true);
    expect(looksIncomplete('Gracias. Oye, quisiera saber el estado de un vehículo. Creo que-')).toBe(true);
    expect(looksIncomplete('Bueno, quiero saber el estado de un')).toBe(true);
    expect(looksIncomplete('la placa es')).toBe(true);
  });
  it('frases completas no esperan de más', () => {
    expect(looksIncomplete('¿Dónde está mi vehículo?')).toBe(false);
    expect(looksIncomplete('El código es Xch6820')).toBe(false);
    expect(looksIncomplete('Okey, muchas gracias.')).toBe(false);
    expect(looksIncomplete('llévame a posiciones')).toBe(false);
    expect(looksIncomplete('')).toBe(false);
  });
});

describe('lectura anticipada prudente', () => {
  const mk = () => {
    const pieces: string[] = [];
    return { pieces, f: createStreamSpeechFeeder(ttsCleanText, (p) => pieces.push(p)) };
  };
  it('no corta en ":" ni en frases cortas', () => {
    const { pieces, f } = mk();
    f.feed('Estos son tus vehículos: Apache 160 placa XVR86E y Chevrolet NPR placa GUU584 en Bogotá');
    f.feed('Ok. Tu camioneta está bien y sigue en el mismo lugar de siempre');
    expect(pieces).toEqual([]);
  });
  it('espera a que llegue texto después de la primera frase', () => {
    const { pieces, f } = mk();
    f.feed('Tu camioneta está parqueada en Bogotá desde hace una hora. ');
    expect(pieces).toEqual([]);
    f.feed('Tu camioneta está parqueada en Bogotá desde hace una hora. Tiene la batería al 100 %');
    expect(pieces).toEqual(['Tu camioneta está parqueada en Bogotá desde hace una hora.']);
  });
});

describe('core.js: la voz sigue entre vistas', () => {
  it('guarda el modo y lo restaura al cargar la vista', () => {
    expect(core).toContain("persistVoiceMode(cfg, 'mic')");
    expect(fnSource('toggleTtsMode')).toContain('persistVoiceMode(cfg');
    expect(core).toContain('setTimeout(restoreVoiceModeAfterNavigation, 300)');
  });
  it('si el navegador bloquea el audio, lo guarda y lo lee al primer toque', () => {
    expect(fnSource('ttsSpeakElevenLabs')).toMatch(/NotAllowedError[\s\S]*ttsBlockedText[\s\S]*armResumeOnGesture\(\)/);
    expect(fnSource('armResumeOnGesture')).toContain('ttsReplyQueue.enqueue(pending)');
  });
});
