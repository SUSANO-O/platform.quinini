// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Lectura en voz alta del widget: cada respuesta se lee COMPLETA y después la siguiente; nunca dos a
 * la vez. Antes, un mensaje nuevo arrancaba encima del anterior (sonaban las dos). Se ejecuta la
 * función real de core.js.
 */
const core = readFileSync(join(process.cwd(), 'scripts/widget/core.js'), 'utf8');

function fnSource(name: string): string {
  const start = core.indexOf(`    function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const end = core.indexOf('\n    }\n', start);
  return core.slice(start, end + '\n    }\n'.length);
}

type Queue = { enqueue: (t: string) => void; clear: () => void; busy: () => boolean; size: () => number };
type Play = (text: string, done: () => void) => void;
// eslint-disable-next-line no-new-func
const createTtsQueue = new Function(`${fnSource('createTtsQueue')}; return createTtsQueue;`)() as (
  play: Play,
  onIdle?: () => void,
) => Queue;

function harness() {
  const log: string[] = [];
  const playing: { text: string; done: () => void }[] = [];
  let idle = 0;
  const q = createTtsQueue(
    (text, done) => {
      log.push(`start:${text}`);
      playing.push({ text, done });
    },
    () => idle++,
  );
  const finish = () => {
    const cur = playing.shift()!;
    log.push(`end:${cur.text}`);
    cur.done();
  };
  return { q, log, finish, idle: () => idle, playing };
}

describe('cola de lectura del widget', () => {
  it('un mensaje que llega mientras lee espera a que termine el anterior', () => {
    const h = harness();
    h.q.enqueue('uno');
    h.q.enqueue('dos');
    expect(h.log).toEqual(['start:uno']);
    expect(h.q.size()).toBe(1);
    h.finish();
    expect(h.log).toEqual(['start:uno', 'end:uno', 'start:dos']);
    h.finish();
    expect(h.idle()).toBe(1);
    expect(h.q.busy()).toBe(false);
  });

  it('nunca hay dos lecturas a la vez', () => {
    const h = harness();
    for (const t of ['a', 'b', 'c', 'd']) h.q.enqueue(t);
    let max = 0;
    while (h.playing.length) {
      max = Math.max(max, h.playing.length);
      h.finish();
    }
    expect(max).toBe(1);
    expect(h.log.filter((l) => l.startsWith('start:'))).toEqual(['start:a', 'start:b', 'start:c', 'start:d']);
  });

  it('clear corta todo: el "terminé" tardío de la lectura vieja no arranca nada', () => {
    const h = harness();
    h.q.enqueue('uno');
    h.q.enqueue('dos');
    const stale = h.playing[0]!.done;
    h.q.clear();
    stale();
    expect(h.log).toEqual(['start:uno']);
    expect(h.q.busy()).toBe(false);
    expect(h.idle()).toBe(0);
    h.q.enqueue('tres');
    expect(h.log).toEqual(['start:uno', 'start:tres']);
  });

  it('un "terminé" repetido no se salta mensajes', () => {
    const h = harness();
    h.q.enqueue('uno');
    h.q.enqueue('dos');
    h.q.enqueue('tres');
    const d = h.playing[0]!.done;
    d();
    d();
    expect(h.log).toEqual(['start:uno', 'start:dos']);
  });

  it('ignora textos vacíos', () => {
    const h = harness();
    h.q.enqueue('');
    expect(h.q.busy()).toBe(false);
    expect(h.log).toEqual([]);
  });
});

describe('core.js: arrancar una lectura detiene la anterior', () => {
  it('ElevenLabs y nativa paran lo que estuviera sonando antes de empezar', () => {
    expect(fnSource('ttsSpeakElevenLabs')).toMatch(/^\s*function ttsSpeakElevenLabs\(text, onEnd\) \{\s*ttsHaltPlayback\(\);/);
    expect(fnSource('ttsSpeakNative')).toContain('ttsHaltPlayback();');
    const halt = fnSource('ttsHaltPlayback');
    expect(halt).toContain('speechSynthesis.cancel()');
    expect(halt).toContain('ttsAudio.pause()');
  });

  it('las respuestas pasan por la cola y stop la vacía', () => {
    expect(fnSource('speakBotReplyIfEnabled')).toContain('ttsReplyQueue.enqueue(');
    expect(fnSource('ttsStop')).toContain('ttsReplyQueue.clear()');
  });
});
