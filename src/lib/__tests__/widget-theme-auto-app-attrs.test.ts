import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Tema automático con marcas propias de cada app. Caso real: la plataforma de Tribu cambia de modo
 * con `<html data-tema-ui="claro" | "oscuro">` (sin clase ni data-theme); el widget se quedaba en
 * el tema del arranque porque no reconocía el atributo ni lo vigilaba.
 */
const WIDGET_JS = readFileSync(join(process.cwd(), 'public/widget.js'), 'utf8');

type Api = { getState(): { theme: string }; destroy(): void };
type Win = Window & typeof globalThis;

let dom: JSDOM | null = null;

function boot(htmlAttrs: string, systemDark = false): Win {
  dom = new JSDOM(`<!doctype html><html ${htmlAttrs}><head></head><body></body></html>`, {
    url: 'https://plataforma.cliente.test/views/posiciones.php',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const win = dom.window as unknown as Win;
  (win as unknown as { fetch: unknown }).fetch = async () => new win.Response('{}', { status: 200 });
  (win as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
    media: q,
    matches: q.includes('prefers-color-scheme: dark') ? systemDark : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  win.eval(WIDGET_JS);
  return win;
}

function mount(win: Win): Api {
  return (win as unknown as { AgentFlowhub: { init(c: Record<string, unknown>): Api } }).AgentFlowhub.init({
    preview: true,
    previewPick: false,
    previewMessages: [{ role: 'model', content: 'Hola' }],
    agentId: 'preview',
    token: '',
    host: win.location.origin,
    trackEvents: false,
    autoOpen: true,
    theme: 'auto',
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  dom?.window.close();
  dom = null;
});

describe('widget — tema automático con atributos propios de la app', () => {
  it('Tribu: sigue data-tema-ui="oscuro" / "claro" al montar y en vivo, aunque el sistema diga lo contrario', async () => {
    const win = boot('lang="es" data-tema-ui="oscuro"', false);
    const inst = mount(win);
    await wait(50);
    expect(inst.getState().theme).toBe('dark');

    win.document.documentElement.setAttribute('data-tema-ui', 'claro');
    await wait(60);
    expect(inst.getState().theme).toBe('light');

    win.document.documentElement.setAttribute('data-tema-ui', 'oscuro');
    await wait(60);
    expect(inst.getState().theme).toBe('dark');
    inst.destroy();
  });

  it('con el sistema en oscuro, data-tema-ui="claro" deja el widget claro', async () => {
    const win = boot('data-tema-ui="claro"', true);
    const inst = mount(win);
    await wait(50);
    expect(inst.getState().theme).toBe('light');
    inst.destroy();
  });

  it.each([
    ['data-color-mode="dark"', 'dark'],
    ['data-modo="oscuro"', 'dark'],
    ['data-app-theme="night"', 'dark'],
    ['data-tema="claro"', 'light'],
    ['class="modo-oscuro"', 'dark'],
  ])('reconoce <html %s> → %s', async (attrs, expected) => {
    const win = boot(attrs, expected === 'light');
    const inst = mount(win);
    await wait(50);
    expect(inst.getState().theme).toBe(expected);
    inst.destroy();
  });

  it('atributos data-* que no hablan de tema no cuentan (decide el sistema)', async () => {
    const win = boot('data-page="dark-room" data-user="oscar"', false);
    const inst = mount(win);
    await wait(50);
    expect(inst.getState().theme).toBe('light');
    inst.destroy();
  });
});
