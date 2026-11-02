import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * "Leer la pantalla" en el SDK compilado: con la opción activada, cada mensaje lleva la estructura
 * de la página (título, encabezados, sección activa, menús) y NUNCA tablas, campos ni el widget.
 * Página modelada sobre "Detalle del equipo" de la plataforma de Tribu.
 */
const WIDGET_JS = readFileSync(join(process.cwd(), 'public/widget.js'), 'utf8');

const TRIBU_DETALLE = `
<header><nav class="breadcrumb"><a href="#">Vigilancia</a> › <span>Detalle del equipo</span></nav>
  <nav class="topnav"><a href="#">Vigilancia</a><a href="#">Configuraciones</a><a href="#">Reportes</a>
    <ul class="dropdown-menu" style="display:none"><li><a href="#">Menú oculto secreto</a></li></ul></nav></header>
<aside class="sidebar">
  <div class="owner">Hamilton Stiven Zamora Pé</div>
  <a href="#">Posición Actual</a><a href="#">Rutas</a><a href="#">Ruta Día</a>
  <a href="#">Datos usuario</a><a href="#">Datos vehículo</a><a href="#">Eventos</a>
  <a href="#" class="active">AI data</a><a href="#">Datos de la red</a>
</aside>
<main>
  <h1>AI data</h1><h3>Durmió en un lugar nuevo</h3>
  <form><input name="q" value="placa secreta ABC123"><textarea>nota privada</textarea></form>
  <table><tbody><tr><td>Xch5788</td><td>cliente@correo.com</td><td>3213598997</td></tr></tbody></table>
  <div hidden><a href="#">Enlace escondido</a></div>
</main>`;

type Api = { send(m: string): void; destroy(): void };
type Win = Window & typeof globalThis;

let dom: JSDOM | null = null;

async function sendAndCapture(screenContextEnabled: boolean): Promise<Record<string, unknown>> {
  dom = new JSDOM(`<!doctype html><html><head><title>Tribu GPS</title></head><body>${TRIBU_DETALLE}</body></html>`, {
    url: 'https://plataforma.cliente.test/views/detalle.php?id=9',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const win = dom.window as unknown as Win;
  const bodies: Record<string, unknown>[] = [];
  (win as unknown as { fetch: unknown }).fetch = async (_url: string, init?: { body?: unknown }) => {
    if (init && typeof init.body === 'string' && init.body.includes('"message"')) {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
    }
    return new win.Response(JSON.stringify({ reply: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  win.eval(WIDGET_JS);
  const inst = (win as unknown as { AgentFlowhub: { init(c: Record<string, unknown>): Api } }).AgentFlowhub.init({
    agentId: 'agent_1',
    host: win.location.origin,
    trackEvents: false,
    autoOpen: true,
    screenContextEnabled,
  });
  await new Promise((r) => setTimeout(r, 150));
  inst.send('¿En qué vista estoy?');
  for (let i = 0; i < 40 && !bodies.length; i++) await new Promise((r) => setTimeout(r, 50));
  inst.destroy();
  if (!bodies.length) throw new Error('el widget no envió el mensaje');
  return bodies[0];
}

afterEach(() => {
  dom?.window.close();
  dom = null;
});

describe('widget — leer la pantalla', () => {
  it('manda título, migas, encabezados, sección activa y menús', async () => {
    const body = await sendAndCapture(true);
    const sc = String(body.screenContext ?? '');
    expect(sc).toContain('Título de la pestaña: Tribu GPS');
    expect(sc).toContain('Detalle del equipo');
    expect(sc).toMatch(/Encabezados visibles: AI data · Durmió en un lugar nuevo/);
    expect(sc).toContain('Seleccionado/activo ahora: AI data');
    expect(sc).toMatch(/Menú.*Posición Actual · Rutas · Ruta Día · Datos usuario · Datos vehículo · Eventos · AI data · Datos de la red/);
    expect(sc).toMatch(/Menú.*Vigilancia · Configuraciones · Reportes/);
  });

  it('nunca lee tablas, campos, lo oculto ni el propio widget', async () => {
    const sc = String((await sendAndCapture(true)).screenContext ?? '');
    for (const secret of ['Xch5788', 'cliente@correo.com', '3213598997', 'placa secreta', 'nota privada', 'Menú oculto secreto', 'Enlace escondido', 'Escribe un mensaje', 'Navi', 'afhub']) {
      expect(sc).not.toContain(secret);
    }
  });

  it('sin la opción no manda nada de la pantalla', async () => {
    const body = await sendAndCapture(false);
    expect(body.screenContext).toBeUndefined();
    expect(body.pagePath).toBeDefined();
  });
});
