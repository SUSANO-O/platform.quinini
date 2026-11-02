import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Tema "auto" del SDK compilado (public/widget.js): el widget sigue el modo claro/oscuro de la
 * página que lo incrusta y cambia en vivo. Prioridad: AgentFlowhub.setTheme() de la app →
 * señales de la página (clase, data-theme, data-bs-theme, color-scheme) → modo del sistema.
 * Un tema fijo (claro u oscuro) nunca cambia.
 */
const WIDGET_JS = readFileSync(join(process.cwd(), 'public/widget.js'), 'utf8');

type State = { isOpen: boolean; theme: string; themePreference: string };
type Api = { getState(): State; destroy(): void };
type Hub = { init(c: Record<string, unknown>): Api; setTheme(t: string): void };
type Win = Window & typeof globalThis;

let dom: JSDOM | null = null;
let systemDark = false;
let mqListeners: Array<() => void> = [];

function boot(opts: { systemDark?: boolean; htmlAttrs?: string } = {}): Win {
  systemDark = Boolean(opts.systemDark);
  mqListeners = [];
  dom = new JSDOM(`<!doctype html><html ${opts.htmlAttrs ?? ''}><head></head><body></body></html>`, {
    url: 'https://app.cliente.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const win = dom.window as unknown as Win;
  (win as unknown as { fetch: unknown }).fetch = async () => new win.Response('{}', { status: 200 });
  // jsdom no trae matchMedia: uno controlable para simular el modo del sistema.
  (win as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
    media: q,
    get matches() {
      return q.includes('prefers-color-scheme: dark') ? systemDark : false;
    },
    addEventListener: (_t: string, fn: () => void) => mqListeners.push(fn),
    removeEventListener: (_t: string, fn: () => void) => {
      mqListeners = mqListeners.filter((f) => f !== fn);
    },
  });
  win.eval(WIDGET_JS);
  return win;
}

function hub(win: Win): Hub {
  return (win as unknown as { AgentFlowhub: Hub }).AgentFlowhub;
}

function mount(win: Win, theme: string, autoOpen = true): Api {
  return hub(win).init({
    preview: true,
    previewPick: false,
    previewMessages: [{ role: 'model', content: 'Hola, ¿en qué te ayudo?' }],
    agentId: 'preview',
    token: '',
    host: win.location.origin,
    trackEvents: false,
    autoOpen,
    theme,
  });
}

function rootEl(win: Win): HTMLElement {
  const el = win.document.querySelector('[data-afhub-theme]') as HTMLElement | null;
  if (!el) throw new Error('widget sin montar');
  return el;
}

function widgetCss(win: Win): string {
  return (rootEl(win).querySelector('style') as HTMLStyleElement).textContent ?? '';
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  dom?.window.close();
  dom = null;
});

describe('widget — tema fijo', () => {
  it('claro se queda claro aunque la página y la app digan oscuro', async () => {
    const win = boot({ systemDark: true, htmlAttrs: 'class="dark"' });
    const inst = mount(win, 'light');
    await wait(50);
    hub(win).setTheme('dark');
    await wait(50);
    expect(inst.getState().theme).toBe('light');
    expect(rootEl(win).getAttribute('data-afhub-theme')).toBe('light');
    inst.destroy();
  });

  it('oscuro se queda oscuro', async () => {
    const win = boot({ htmlAttrs: 'class="light"' });
    const inst = mount(win, 'dark');
    await wait(50);
    expect(inst.getState()).toMatchObject({ theme: 'dark', themePreference: 'dark' });
    inst.destroy();
  });

  it('un valor desconocido cae en claro (comportamiento de siempre)', async () => {
    const win = boot({ systemDark: true });
    const inst = mount(win, 'sepia');
    await wait(50);
    expect(inst.getState()).toMatchObject({ theme: 'light', themePreference: 'light' });
    inst.destroy();
  });
});

describe('widget — tema automático al montar', () => {
  it('sin señales de la página sigue el modo del sistema', async () => {
    let win = boot({ systemDark: false });
    let inst = mount(win, 'auto');
    await wait(50);
    expect(inst.getState()).toMatchObject({ theme: 'light', themePreference: 'auto' });
    inst.destroy();
    dom?.window.close();

    win = boot({ systemDark: true });
    inst = mount(win, 'auto');
    await wait(50);
    expect(inst.getState().theme).toBe('dark');
    inst.destroy();
  });

  it.each([
    ['class="dark"', 'dark'],
    ['class="app theme-dark"', 'dark'],
    ['data-theme="dark"', 'dark'],
    ['data-bs-theme="dark"', 'dark'],
    ['style="color-scheme: dark"', 'dark'],
    ['class="light"', 'light'],
    ['data-theme="light"', 'light'],
  ])('la página con <html %s> manda sobre el sistema → %s', async (attrs, expected) => {
    const win = boot({ systemDark: expected === 'light', htmlAttrs: attrs });
    const inst = mount(win, 'auto');
    await wait(50);
    expect(inst.getState().theme).toBe(expected);
    inst.destroy();
  });

  it('también lee la clase del <body>', async () => {
    const win = boot();
    win.document.body.className = 'dark-mode';
    const inst = mount(win, 'auto');
    await wait(50);
    expect(inst.getState().theme).toBe('dark');
    inst.destroy();
  });

  it('setTheme() antes de que cargue el widget se aplica al montar', async () => {
    const win = boot({ htmlAttrs: 'class="light"' });
    hub(win).setTheme('dark');
    const inst = mount(win, 'auto');
    await wait(50);
    expect(inst.getState().theme).toBe('dark');
    inst.destroy();
  });
});

describe('widget — tema automático en vivo', () => {
  it('cambia cuando la página pone o quita la clase dark, sin cerrar el chat ni perder mensajes', async () => {
    const win = boot();
    const inst = mount(win, 'auto', true);
    await wait(200);
    const msgsBefore = win.document.querySelectorAll('.afhub-msg').length;
    const cssLight = widgetCss(win);
    expect(inst.getState()).toMatchObject({ theme: 'light', isOpen: true });

    win.document.documentElement.classList.add('dark');
    await wait(60);
    expect(inst.getState()).toMatchObject({ theme: 'dark', isOpen: true });
    expect(rootEl(win).getAttribute('data-afhub-theme')).toBe('dark');
    expect(widgetCss(win)).not.toBe(cssLight);
    expect(win.document.querySelectorAll('.afhub-msg').length).toBe(msgsBefore);

    win.document.documentElement.classList.remove('dark');
    await wait(60);
    expect(inst.getState().theme).toBe('light');
    expect(widgetCss(win)).toBe(cssLight);
    inst.destroy();
  });

  it('cambia con data-theme del <body>', async () => {
    const win = boot();
    const inst = mount(win, 'auto');
    await wait(50);
    win.document.body.setAttribute('data-theme', 'dark');
    await wait(60);
    expect(inst.getState().theme).toBe('dark');
    inst.destroy();
  });

  it('cambia cuando el sistema pasa a oscuro', async () => {
    const win = boot({ systemDark: false });
    const inst = mount(win, 'auto');
    await wait(50);
    systemDark = true;
    for (const fn of mqListeners) fn();
    await wait(60);
    expect(inst.getState().theme).toBe('dark');
    inst.destroy();
  });

  it('setTheme() de la app manda sobre la página; setTheme("auto") le devuelve el control', async () => {
    const win = boot({ htmlAttrs: 'class="light"' });
    const inst = mount(win, 'auto');
    await wait(50);
    hub(win).setTheme('dark');
    await wait(20);
    expect(inst.getState().theme).toBe('dark');
    hub(win).setTheme('auto');
    await wait(20);
    expect(inst.getState().theme).toBe('light');
    inst.destroy();
  });

  it('tras destroy deja de vigilar la página', async () => {
    const win = boot();
    const inst = mount(win, 'auto');
    await wait(50);
    inst.destroy();
    expect(mqListeners).toHaveLength(0);
    win.document.documentElement.classList.add('dark');
    await wait(60);
    expect(win.document.querySelector('[data-afhub-theme]')).toBeNull();
  });
});
