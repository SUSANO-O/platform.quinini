// @vitest-environment jsdom
import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MySqlProbe } from './mysql-probe';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { React: typeof React }).React = React;

function typeInto(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('<MySqlProbe>', () => {
  it('envía la identidad y muestra conteos y tablas no accesibles', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          claims: ['cliente'],
          tables: [
            { table: 'Usuarios', ok: true, total: 1, ms: 5 },
            { table: 'Administradores', ok: false, error: 'Falta el dato "admin"', ms: 1 },
          ],
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    act(() => root.render(createElement(MySqlProbe, { connectionId: 'c1', landingAgentId: 'a1' })));
    const valueInput = container.querySelector('input[aria-label="Valor"]') as HTMLInputElement;
    act(() => typeInto(valueInput, '1234'));
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Probar')!;
    act(() => btn.click());
    await flush();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/mcp/connections/c1/mysql-probe?landingAgentId=a1');
    expect(JSON.parse(String(init.body))).toEqual({ identity: { cliente: '1234' } });
    expect(container.textContent).toContain('Usuarios');
    expect(container.textContent).toContain('1 fila');
    expect(container.textContent).toContain('No accesible: Falta el dato "admin"');
    expect(container.textContent).toContain('Datos de identidad aplicados: cliente');
  });

  it('muestra el error del servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Conexión no encontrada para este agente.' }) })));
    act(() => root.render(createElement(MySqlProbe, { connectionId: 'c1', landingAgentId: 'a1' })));
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Probar')!;
    act(() => btn.click());
    await flush();
    expect(container.textContent).toContain('Conexión no encontrada para este agente.');
  });
});
