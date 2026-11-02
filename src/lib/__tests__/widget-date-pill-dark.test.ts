import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * La etiqueta de fecha ("Hoy") en modo oscuro heredaba la píldora blanca translúcida del claro con
 * texto gris y casi no se leía. En oscuro lleva su propia regla (también en pantalla completa).
 */
const WIDGET_JS = readFileSync(join(process.cwd(), 'public/widget.js'), 'utf8');

let dom: JSDOM | null = null;

function widgetCss(theme: string): string {
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://studio.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const win = dom.window as unknown as Window & typeof globalThis;
  (win as unknown as { fetch: unknown }).fetch = async () => new win.Response('{}', { status: 200 });
  win.eval(WIDGET_JS);
  (win as unknown as { AgentFlowhub: { init(c: Record<string, unknown>): unknown } }).AgentFlowhub.init({
    preview: true,
    previewPick: false,
    previewMessages: [{ role: 'model', content: 'Hola' }],
    agentId: 'preview',
    token: '',
    host: win.location.origin,
    trackEvents: false,
    autoOpen: true,
    theme,
  });
  return (win.document.querySelector('[data-afhub-theme] style') as HTMLStyleElement).textContent ?? '';
}

afterEach(() => {
  dom?.window.close();
  dom = null;
});

describe('widget — etiqueta de fecha en oscuro', () => {
  it('oscuro: regla propia legible, también en pantalla completa', () => {
    const css = widgetCss('dark');
    expect(css).toMatch(/\[data-afhub-theme="dark"\] \.afhub-date-divider span,[^{]*\[data-afhub-theme="dark"\] \.afhub-chat\.afhub-chat--fullscreen \.afhub-date-divider span \{ color:#c4c4cf; background:rgba\(255,255,255,\.08\)/);
  });

  it('claro: sin la regla oscura (se queda como siempre)', () => {
    const css = widgetCss('light');
    expect(css).not.toContain('.afhub-date-divider span { color:#c4c4cf');
    expect(css).toContain('color:#94a3b8; background:rgba(255,255,255,.42)');
  });
});
