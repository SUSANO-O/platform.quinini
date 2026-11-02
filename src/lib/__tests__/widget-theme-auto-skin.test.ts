import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Tema automático + piel personalizada. Caso real (Navi App de Tribu): la piel tenía superficies
 * oscuras fijas (fondo del chat, pie, caja de escribir, burbuja del bot) y el widget seguía
 * viéndose oscuro con la app en claro aunque el tema ya hubiera cambiado. En automático, los
 * colores de superficie solo se aplican si encajan con el modo; los de marca siempre.
 */
const WIDGET_JS = readFileSync(join(process.cwd(), 'public/widget.js'), 'utf8');

const NAVI_APP_SKIN = {
  headerBg: '#cc7400',
  headerText: '#f3f4f6',
  footerBg: '#111318',
  inputBg: '#1f222b',
  inputText: '#f3f4f6',
  sendBg: '#ff9100',
  chatBg: '#16181f',
  userBubbleBg: '#ff9100',
  userBubbleText: '#111111',
  botBubbleBg: '#23262f',
  botBubbleText: '#eef0f5',
  fabBg: '#ff9100',
  fontFamily: 'Poppins',
  fontScale: 'lg',
  hideAvatar: true,
};

type Api = { getState(): { theme: string }; destroy(): void };
type Win = Window & typeof globalThis;

let dom: JSDOM | null = null;

function boot(htmlAttrs: string): Win {
  dom = new JSDOM(`<!doctype html><html ${htmlAttrs}><head></head><body></body></html>`, {
    url: 'https://plataforma.cliente.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const win = dom.window as unknown as Win;
  (win as unknown as { fetch: unknown }).fetch = async () => new win.Response('{}', { status: 200 });
  (win as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
    media: q,
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  win.eval(WIDGET_JS);
  return win;
}

function mount(win: Win, theme: string, skin: Record<string, unknown>): Api {
  return (win as unknown as { AgentFlowhub: { init(c: Record<string, unknown>): Api } }).AgentFlowhub.init({
    preview: true,
    previewPick: false,
    previewMessages: [{ role: 'model', content: 'Hola' }],
    agentId: 'preview',
    token: '',
    host: win.location.origin,
    trackEvents: false,
    autoOpen: true,
    theme,
    skin,
  });
}

/** El <style> de la piel es el que lleva las reglas con !important de la cabecera/burbujas. */
function skinCss(win: Win): string {
  const styles = Array.from(win.document.querySelectorAll('[data-afhub-theme] style')) as HTMLStyleElement[];
  return styles.slice(1).map((s) => s.textContent ?? '').join('\n');
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  dom?.window.close();
  dom = null;
});

describe('widget — tema automático con piel personalizada', () => {
  it('Navi App: en oscuro usa sus superficies oscuras; en claro las deja y conserva la marca', async () => {
    const win = boot('data-tema-ui="oscuro"');
    const inst = mount(win, 'auto', NAVI_APP_SKIN);
    await wait(50);
    expect(inst.getState().theme).toBe('dark');
    let css = skinCss(win);
    expect(css).toContain('.afhub-messages{background:#16181f');
    expect(css).toContain('.afhub-msg.bot{background:#23262f !important;color:#eef0f5');
    expect(css).toContain('.afhub-input{color:#f3f4f6');

    win.document.documentElement.setAttribute('data-tema-ui', 'claro');
    await wait(60);
    expect(inst.getState().theme).toBe('light');
    css = skinCss(win);
    for (const surface of ['#16181f', '#111318', '#1f222b', '#23262f', '#eef0f5']) {
      expect(css).not.toContain(surface);
    }
    expect(css).not.toContain('.afhub-input{color:');
    // Marca, fuente y opciones: siempre.
    expect(css).toContain('.afhub-header{background:#cc7400');
    expect(css).toContain('.afhub-header *{color:#f3f4f6');
    expect(css).toContain('.afhub-send{background:#ff9100');
    expect(css).toContain('.afhub-msg.user{background:#ff9100 !important;color:#111111');
    expect(css).toContain('.afhub-fab{background:#ff9100');
    expect(css).toContain('Poppins');
    expect(css).toContain('.afhub-avatar{display:none');

    win.document.documentElement.setAttribute('data-tema-ui', 'oscuro');
    await wait(60);
    expect(skinCss(win)).toContain('.afhub-messages{background:#16181f');
    inst.destroy();
  });

  it('arrancando en claro con una piel solo de superficies oscuras, al pasar a oscuro aparece', async () => {
    const win = boot('data-tema-ui="claro"');
    const inst = mount(win, 'auto', { chatBg: '#16181f', botBubbleBg: '#23262f' });
    await wait(50);
    expect(skinCss(win)).not.toContain('#16181f');
    win.document.documentElement.setAttribute('data-tema-ui', 'oscuro');
    await wait(60);
    expect(skinCss(win)).toContain('.afhub-messages{background:#16181f');
    inst.destroy();
  });

  it('una piel de superficies claras solo se aplica en modo claro', async () => {
    const win = boot('data-tema-ui="oscuro"');
    const inst = mount(win, 'auto', { chatBg: '#fffaf2', botBubbleText: '#1a1a1a' });
    await wait(50);
    expect(skinCss(win)).not.toContain('#fffaf2');
    expect(skinCss(win)).not.toContain('#1a1a1a');
    win.document.documentElement.setAttribute('data-tema-ui', 'claro');
    await wait(60);
    expect(skinCss(win)).toContain('.afhub-messages{background:#fffaf2');
    expect(skinCss(win)).toContain('color:#1a1a1a');
    inst.destroy();
  });

  it.each(['light', 'dark'])('con tema fijo "%s" la piel se aplica tal cual (como siempre)', async (theme) => {
    const win = boot(theme === 'light' ? 'data-tema-ui="oscuro"' : 'data-tema-ui="claro"');
    const inst = mount(win, theme, NAVI_APP_SKIN);
    await wait(50);
    const css = skinCss(win);
    expect(css).toContain('.afhub-messages{background:#16181f');
    expect(css).toContain('.afhub-input{color:#f3f4f6');
    inst.destroy();
  });
});
