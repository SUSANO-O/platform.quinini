// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Stream del widget: (1) no perder el "done" pegado al cierre, (2) no dejar filas vacías al borrar
 * texto provisional (token_reset), (3) si el stream se corta sin "done", recuperar la respuesta
 * guardada en vez de dejar el "Escribiendo…" pegado. Incidente Navi App 2026-11-20.
 * El SDK es JS plano: se extraen las funciones reales de core.js y se ejecutan.
 */
const core = readFileSync(join(process.cwd(), 'scripts/widget/core.js'), 'utf8');

function fnSource(name: string): string {
  const start = core.indexOf(`    function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const end = core.indexOf('\n    }\n', start);
  return core.slice(start, end + '\n    }\n'.length);
}
function load<T>(name: string): T {
  // eslint-disable-next-line no-new-func
  return new Function(`${fnSource(name)}; return ${name};`)() as T;
}

type Taken = { events: Record<string, unknown>[]; rest: string };
const takeSseEvents = load<(buf: string, flush: boolean) => Taken>('takeSseEvents');
const removeBotMessage = load<(el: Element | null) => void>('removeBotMessage');

const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

describe('takeSseEvents', () => {
  it('devuelve eventos completos y guarda el resto incompleto', () => {
    const buf = ev({ type: 'token', text: 'Hola' }) + 'data: {"type":"tok';
    const r = takeSseEvents(buf, false);
    expect(r.events).toEqual([{ type: 'token', text: 'Hola' }]);
    expect(r.rest).toBe('data: {"type":"tok');
  });

  it('con flush procesa el último bloque aunque no tenga la línea en blanco final (el "done" pegado al cierre)', () => {
    const buf = ev({ type: 'token', text: 'x' }) + 'data: {"type":"done","reply":"Tienes 1 dispositivo"}';
    expect(takeSseEvents(buf, false).events.map((e) => e.type)).toEqual(['token']);
    const flushed = takeSseEvents(buf, true);
    expect(flushed.events.map((e) => e.type)).toEqual(['token', 'done']);
    expect(flushed.rest).toBe('');
  });

  it('ignora líneas que no son data: y JSON roto, sin lanzar', () => {
    const buf = ': keepalive\n\n' + 'data: {roto\n\n' + ev({ type: 'status', message: 'm' });
    expect(takeSseEvents(buf, false).events).toEqual([{ type: 'status', message: 'm' }]);
  });

  it('un evento partido entre dos lecturas se arma bien', () => {
    const full = ev({ type: 'done', reply: 'ok' });
    const a = takeSseEvents(full.slice(0, 15), false);
    expect(a.events).toEqual([]);
    const b = takeSseEvents(a.rest + full.slice(15), false);
    expect(b.events).toEqual([{ type: 'done', reply: 'ok' }]);
  });
});

describe('removeBotMessage', () => {
  it('quita la fila completa (avatar, copiar, hora), no solo el globo', () => {
    document.body.innerHTML =
      '<div id="m"><div class="afhub-msg-row afhub-msg-row--bot"><span class="av"></span>' +
      '<div class="afhub-msg-stack"><div class="afhub-msg bot" id="bubble"></div>' +
      '<div class="afhub-feedback-row"><button>copiar</button><span class="afhub-msg-time">16:35</span></div>' +
      '</div></div></div>';
    removeBotMessage(document.getElementById('bubble'));
    expect(document.getElementById('m')!.children).toHaveLength(0);
    expect(document.body.textContent).not.toContain('16:35');
  });

  it('si el globo no está en una fila, lo quita igual; con null no hace nada', () => {
    document.body.innerHTML = '<div id="m"><div class="afhub-msg bot" id="b"></div></div>';
    removeBotMessage(document.getElementById('b'));
    expect(document.getElementById('m')!.children).toHaveLength(0);
    expect(() => removeBotMessage(null)).not.toThrow();
  });
});

describe('flujo del stream en core.js', () => {
  const streamBlock = core.slice(core.indexOf('var handleStreamEvt = function'), core.indexOf('// ── Standard (non-streaming) fallback'));

  it('ya no borra solo el globo del bot en ningún lado', () => {
    expect(core).not.toMatch(/streamBubble\.remove\(\)/);
    expect(streamBlock).toMatch(/removeBotMessage\(streamBubble\)/);
  });

  it('procesa el último bloque al cerrarse el stream', () => {
    expect(streamBlock).toMatch(/takeSseEvents\(streamBuf, true\)/);
  });

  it('sin "done" ni "error" recupera la respuesta guardada en vez de dejar el turno colgado', () => {
    const i = streamBlock.indexOf('if (!streamDoneEvt && !streamErrorEvt)');
    expect(i).toBeGreaterThan(-1);
    const branch = streamBlock.slice(i, streamBlock.indexOf('if (streamDoneEvt) {', i));
    expect(branch).toMatch(/recoverPendingReply\(/);
    expect(branch).toMatch(/return;/);
  });
});
