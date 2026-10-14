import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** El SDK del widget es JS plano compilado aparte: se revisa su fuente. */
const core = readFileSync(join(process.cwd(), 'scripts/widget/core.js'), 'utf8');
const TECH = /slack|mysql|mongo|hubspot|gmail|jira|tools?\b|mcp|integraci|\bagente\b|rag\b|pipeline|modelo/i;

function block(startMarker: string, endMarker: string): string {
  const i = core.indexOf(startMarker);
  expect(i).toBeGreaterThan(-1);
  return core.slice(i, core.indexOf(endMarker, i));
}

describe('tarjeta "pensando" del widget: textos sencillos y sin nombres técnicos', () => {
  it('la lista de frases de proceso no nombra tecnologías', () => {
    const list = block('var WIDGET_PROCESS_PHRASES = [', '];');
    const phrases = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(phrases.length).toBeGreaterThan(20);
    for (const p of phrases) expect(p).not.toMatch(TECH);
  });

  it('los textos por fase y los títulos cortos no usan jerga', () => {
    const captions = block('function widgetStatusCaptionForPhase(', '\n    }\n');
    const titles = block('function thinkingFooterState(', '\n    }\n');
    for (const src of [captions, titles]) {
      for (const [, text] of src.matchAll(/return '([^']+)'/g)) expect(text).not.toMatch(TECH);
    }
  });

  it('el texto del servidor solo se muestra si está en la lista cerrada', () => {
    const fn = block('function processPhraseFor(', '\n    }\n');
    expect(fn).toContain('WIDGET_PROCESS_PHRASES.indexOf(t) >= 0');
    expect(block('function resolveThinkingDisplay(', '\n    }\n')).not.toContain('sanitizeThinkingStatusText(statusLabel)');
  });

  it('ya no existen los rótulos técnicos de antes', () => {
    for (const old of ["'Ejecutando tools'", "'Integraciones'", "'Identificando agente…'", "'Usando ' + d"]) {
      expect(block('function widgetStatusCaptionForPhase(', 'function startTypingTimer(')).not.toContain(old);
    }
  });
});
