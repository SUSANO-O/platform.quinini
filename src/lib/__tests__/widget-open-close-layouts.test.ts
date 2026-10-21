import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Comportamiento real del SDK compilado (public/widget.js) en un DOM: abrir/cerrar en cada diseño.
 * Cubre dos fallos que llegaron a producción:
 *  - el selector Abierto/Cerrado del estudio no cerraba (la vista previa restauraba "abierto" de la sesión);
 *  - al cerrar la barra lateral, el panel saltaba al recuadro flotante antes de ocultarse.
 */
const WIDGET_JS = readFileSync(join(process.cwd(), 'public/widget.js'), 'utf8');

type Api = { getState(): { isOpen: boolean }; destroy(): void };
type Win = Window & typeof globalThis;

/** El tipo global de `window.AgentFlowhub` (para la landing) no expone getState; aquí se usa el SDK tal cual. */
function init(win: Win, cfg: Record<string, unknown>): Api {
  return (win as unknown as { AgentFlowhub: { init(c: Record<string, unknown>): Api } }).AgentFlowhub.init(cfg);
}

let dom: JSDOM | null = null;

function boot(): Win {
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://studio.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    // Silencia los avisos de CSS que jsdom no soporta (backdrop-filter, @property…).
    virtualConsole: new VirtualConsole(),
  });
  const win = dom.window as unknown as Win;
  // El modo vista previa no llama al servidor; cualquier fetch residual responde vacío.
  (win as unknown as { fetch: unknown }).fetch = async () => new win.Response('{}', { status: 200 });
  win.eval(WIDGET_JS);
  return win;
}

function previewCfg(win: Win, autoOpen: boolean): Record<string, unknown> {
  return {
    preview: true,
    previewPick: false,
    previewMessages: [{ role: 'model', content: 'Hola' }],
    agentId: 'preview',
    token: '',
    host: win.location.origin,
    trackEvents: false,
    autoOpen,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function button(win: Win, label: string): HTMLButtonElement {
  const b = win.document.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  if (!b) throw new Error(`no existe el botón "${label}"`);
  return b;
}

afterEach(() => {
  dom?.window.close();
  dom = null;
});

describe('widget — selector Abierto/Cerrado de la vista previa', () => {
  it('remontar en "Cerrado" deja el chat cerrado aunque antes estuviera abierto', async () => {
    const win = boot();
    let inst = init(win, previewCfg(win, true));
    await wait(200);
    expect(inst.getState().isOpen).toBe(true);
    inst.destroy();

    inst = init(win, previewCfg(win, false));
    await wait(200);
    expect(inst.getState().isOpen).toBe(false);
    inst.destroy();

    inst = init(win, previewCfg(win, true));
    await wait(200);
    expect(inst.getState().isOpen).toBe(true);
  });

  it('la vista previa no guarda el estado abierto en la sesión del navegador', async () => {
    const win = boot();
    init(win, previewCfg(win, true));
    await wait(200);
    const keys = Object.keys(win.sessionStorage).filter((k) => k.includes('ui-open'));
    expect(keys).toEqual([]);
  });
});

describe('widget — cerrar la barra lateral', () => {
  for (const [name, clicks] of [
    ['compacta', ['Anclar como barra lateral']],
    ['ancha', ['Anclar como barra lateral', 'Ampliar barra']],
  ] as const) {
    it(`barra ${name}: se oculta en su sitio y solo después vuelve al diseño flotante`, async () => {
      const win = boot();
      const inst = init(win, previewCfg(win, true));
      await wait(200);
      for (const label of clicks) {
        button(win, label).click();
        await wait(50);
      }
      const chat = win.document.querySelector('.afhub-chat') as HTMLElement;
      expect(chat.classList.contains('afhub-chat--sidebar')).toBe(true);

      button(win, 'Cerrar chat').click();
      // Mismo instante del clic: ya no visible, pero todavía con la geometría de barra lateral.
      expect(chat.classList.contains('visible')).toBe(false);
      expect(chat.classList.contains('afhub-chat--sidebar')).toBe(true);

      await wait(400);
      expect(chat.classList.contains('afhub-chat--sidebar')).toBe(false);
      expect(inst.getState().isOpen).toBe(false);
    });
  }

  it('la ventana flotante normal se cierra de inmediato', async () => {
    const win = boot();
    const inst = init(win, previewCfg(win, true));
    await wait(200);
    button(win, 'Cerrar chat').click();
    expect(inst.getState().isOpen).toBe(false);
  });
});
