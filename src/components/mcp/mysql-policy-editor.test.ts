// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MySqlPolicyEditor } from './mysql-policy-editor';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Vitest compila el JSX del componente con el runtime clásico (React.createElement): exponerlo.
(globalThis as unknown as { React: typeof React }).React = React;

const policy = {
  tables: {
    Usuarios: { description: 'Perfil', columns: ['k_usuario', 'n_usuario'], scope: { cliente: 'k_usuario' } },
    Pos: {
      columns: ['k_dispositivo'],
      via: { column: 'k_dispositivo', from: 'Bicicletas', select: 'k_disp', scope: { cliente: 'k_usuario' } },
    },
  },
};

/** Escribe en un input/textarea controlado por React (setter nativo + evento input). */
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

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
});

function render(json: string) {
  const onChange = vi.fn();
  act(() => root.render(createElement(MySqlPolicyEditor, { initialJson: json, onChange })));
  return onChange;
}
const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[fn.mock.calls.length - 1] as [string, unknown[]];

describe('<MySqlPolicyEditor>', () => {
  it('muestra una fila por tabla y entrega la política intacta sin errores', () => {
    const onChange = render(JSON.stringify(policy));
    const tableInputs = [...container.querySelectorAll('input')].filter((i) => i.placeholder === 'Nombre de la tabla');
    expect(tableInputs.map((i) => i.value)).toEqual(['Usuarios', 'Pos']);
    expect(container.textContent).toContain('cliente vía Bicicletas.k_usuario');
    const [json, errors] = last(onChange);
    expect(errors).toEqual([]);
    expect(JSON.parse(json)).toEqual(policy);
  });

  it('editar la descripción llega al JSON', () => {
    const onChange = render(JSON.stringify(policy));
    const desc = container.querySelectorAll('textarea')[1] as HTMLTextAreaElement; // descripción de "Pos"
    act(() => typeInto(desc, 'Última posición del equipo'));
    const [json, errors] = last(onChange);
    expect(errors).toEqual([]);
    expect(JSON.parse(json).tables.Pos.description).toBe('Última posición del equipo');
    expect(JSON.parse(json).tables.Pos.via).toEqual(policy.tables.Pos.via);
  });

  it('un dato de identidad "column" se marca como error (incidente Tribu)', () => {
    const onChange = render(JSON.stringify(policy));
    const claim = [...container.querySelectorAll('input')].find((i) => i.value === 'cliente') as HTMLInputElement;
    act(() => typeInto(claim, 'column'));
    const [, errors] = last(onChange);
    expect(errors.length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/campo de la política/);
  });

  it('"Ver JSON" muestra el JSON y se puede volver a las tablas', () => {
    render(JSON.stringify(policy));
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Ver JSON')!;
    act(() => btn.click());
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(JSON.parse(ta.value)).toEqual(policy);
    const back = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Volver a editar por tabla')!;
    act(() => back.click());
    expect(container.textContent).toContain('Tablas que el agente puede leer');
  });

  it('JSON inválido abre directo en modo JSON y no rompe', () => {
    const onChange = render('{ esto no es json');
    expect(container.textContent).toContain('Edición avanzada (JSON)');
    expect(last(onChange)[0]).toBe('{ esto no es json');
  });
});

describe('<MySqlPolicyEditor> importar tablas de la base', () => {
  it('importa una tabla sin columnas sensibles y exige definir el filtro', async () => {
    const onChange = vi.fn();
    const loadSchema = vi.fn(async () => [
      { table: 'Usuarios', columns: [{ name: 'k_usuario', type: 'int', sensitive: false }] },
      {
        table: 'Clientes',
        columns: [
          { name: 'k_cliente', type: 'int', sensitive: false },
          { name: 'password', type: 'varchar', sensitive: true },
        ],
      },
    ]);
    act(() =>
      root.render(createElement(MySqlPolicyEditor, { initialJson: JSON.stringify(policy), onChange, loadSchema })),
    );
    const importBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Importar tablas'))!;
    await act(async () => {
      importBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(loadSchema).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('excluye: password');
    expect(container.textContent).toContain('ya está'); // Usuarios ya existe

    const boxes = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    const clientesBox = boxes.find((b) => b.closest('label')?.textContent?.includes('Clientes'))!;
    act(() => clientesBox.click());
    const addBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Agregar 1'))!;
    act(() => addBtn.click());

    const [json, errors] = last(onChange);
    const out = JSON.parse(json);
    expect(out.tables.Clientes.columns).toEqual(['k_cliente']);
    expect((errors as { table: string }[]).some((e) => e.table === 'Clientes')).toBe(true);
    // Lo que ya estaba no cambia.
    expect(out.tables.Pos.via).toEqual(policy.tables.Pos.via);
  });

  it('sin loadSchema no muestra el botón de importar', () => {
    render(JSON.stringify(policy));
    expect(container.textContent).not.toContain('Importar tablas');
  });
});
