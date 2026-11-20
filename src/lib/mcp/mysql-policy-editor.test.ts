import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  emptyRow,
  modelToJson,
  modelToPolicy,
  parseColumns,
  policyToModel,
  validateModel,
} from './mysql-policy-editor';

const tribuPath = path.resolve(__dirname, '../../../../scripts/local-db/agent-prompts/tribu-mysql-policy.json');
const hasTribu = fs.existsSync(tribuPath);

const simple = {
  tables: {
    Usuarios: { description: 'Perfil', columns: ['k_usuario', 'n_usuario'], scope: { cliente: 'k_usuario' } },
    Tipos: { columns: ['id', 'nombre'], public: true },
    Pos: {
      columns: ['k_dispositivo', 'lat'],
      via: { column: 'k_dispositivo', from: 'Bicicletas', select: 'k_disp', scope: { cliente: 'k_usuario' }, where: { b_activa: 1 } },
    },
  },
  derive: [{ claim: 'admin', from: 'Administradores', match: { cedula: 'cliente' } }],
};

describe('mysql-policy-editor', () => {
  it('detecta el modo de filtro de cada tabla', () => {
    const m = policyToModel(JSON.stringify(simple));
    const by = Object.fromEntries(m.rows.map((r) => [r.table, r]));
    expect(by.Usuarios.mode).toBe('scope');
    expect(by.Usuarios.scopeClaim).toBe('cliente');
    expect(by.Usuarios.scopeColumn).toBe('k_usuario');
    expect(by.Tipos.mode).toBe('public');
    expect(by.Pos.mode).toBe('advanced');
    expect(by.Pos.advancedSummary).toEqual(['cliente vía Bicicletas.k_usuario']);
  });

  it('ida y vuelta sin cambios conserva la política exacta (incluye via, where y derive)', () => {
    const m = policyToModel(JSON.stringify(simple));
    expect(modelToPolicy(m)).toEqual(simple);
  });

  it.runIf(hasTribu)('ida y vuelta con la política real de Tribu no pierde nada', () => {
    const json = fs.readFileSync(tribuPath, 'utf8');
    const original = JSON.parse(json);
    const m = policyToModel(json);
    expect(m.rows).toHaveLength(Object.keys(original.tables).length);
    expect(modelToPolicy(m)).toEqual(original);
    expect(validateModel(m)).toEqual([]);
  });

  it('editar la descripción solo cambia la descripción', () => {
    const m = policyToModel(JSON.stringify(simple));
    m.rows.find((r) => r.table === 'Pos')!.description = 'Última posición del equipo';
    const out = modelToPolicy(m) as { tables: Record<string, Record<string, unknown>> };
    expect(out.tables.Pos.description).toBe('Última posición del equipo');
    expect(out.tables.Pos.via).toEqual(simple.tables.Pos.via);
    expect(out.tables.Usuarios).toEqual(simple.tables.Usuarios);
  });

  it('descripción vacía elimina el campo', () => {
    const m = policyToModel(JSON.stringify(simple));
    m.rows.find((r) => r.table === 'Usuarios')!.description = '   ';
    const out = modelToPolicy(m) as { tables: Record<string, Record<string, unknown>> };
    expect(out.tables.Usuarios).not.toHaveProperty('description');
  });

  it('cambiar a pública quita el filtro; cambiar a filtro quita public', () => {
    const m = policyToModel(JSON.stringify(simple));
    const u = m.rows.find((r) => r.table === 'Usuarios')!;
    u.mode = 'public';
    const t = m.rows.find((r) => r.table === 'Tipos')!;
    t.mode = 'scope';
    t.scopeClaim = 'cliente';
    t.scopeColumn = 'k_usuario';
    const out = modelToPolicy(m) as { tables: Record<string, Record<string, unknown>> };
    expect(out.tables.Usuarios.public).toBe(true);
    expect(out.tables.Usuarios).not.toHaveProperty('scope');
    expect(out.tables.Tipos.scope).toEqual({ cliente: 'k_usuario' });
    expect(out.tables.Tipos).not.toHaveProperty('public');
  });

  it('agregar una tabla nueva', () => {
    const m = policyToModel(JSON.stringify(simple));
    const r = emptyRow();
    r.table = 'Alertas';
    r.columns = 'id, tipo';
    r.scopeColumn = 'k_usuario';
    m.rows.push(r);
    expect(validateModel(m)).toEqual([]);
    const out = modelToPolicy(m) as { tables: Record<string, Record<string, unknown>> };
    expect(out.tables.Alertas).toEqual({ columns: ['id', 'tipo'], scope: { cliente: 'k_usuario' } });
  });

  it('rechaza el error de Tribu: dato de identidad "column"', () => {
    const m = policyToModel(JSON.stringify({ tables: { Bicicletas: { columns: ['k_bici'], scope: { column: 'k_usuario' } } } }));
    const errs = validateModel(m);
    expect(errs.some((e) => /campo de la política/.test(e.message))).toBe(true);
  });

  it('rechaza el mismo error escondido en una regla avanzada', () => {
    const bad = { tables: { B: { columns: ['x'], via: { column: 'x', from: 'P', select: 'y', scope: { column: 'k' } } } } };
    expect(validateModel(policyToModel(JSON.stringify(bad))).length).toBeGreaterThan(0);
  });

  it('valida nombres, columnas, duplicados y tablas sin filtro', () => {
    const m = policyToModel(JSON.stringify(simple));
    m.rows[0].table = 'Tipos'; // duplicada
    m.rows[1].columns = '';
    const r = emptyRow();
    r.table = 'mala tabla';
    r.columns = 'ok, mal-col';
    m.rows.push(r);
    const msgs = validateModel(m).map((e) => e.message).join(' | ');
    expect(msgs).toMatch(/repetida/);
    expect(msgs).toMatch(/al menos una columna/);
    expect(msgs).toMatch(/Nombre de tabla no válido/);
    expect(msgs).toMatch(/Columna no válida: "mal-col"/);
  });

  it('JSON inválido o sin tables lanza', () => {
    expect(() => policyToModel('{no')).toThrow();
    expect(() => policyToModel('{"x":1}')).toThrow(/tables/);
  });

  it('parseColumns y modelToJson', () => {
    expect(parseColumns(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
    expect(JSON.parse(modelToJson(policyToModel(JSON.stringify(simple))))).toEqual(simple);
  });
});

describe('addTablesFromSchema', () => {
  const schema = [
    { table: 'Usuarios', columns: [{ name: 'k_usuario', type: 'int', sensitive: false }] },
    {
      table: 'Clientes',
      columns: [
        { name: 'k_cliente', type: 'int', sensitive: false },
        { name: 'password', type: 'varchar', sensitive: true },
        { name: 'ciudad', type: 'varchar', sensitive: false },
      ],
    },
  ];

  it('agrega tablas nuevas sin columnas sensibles y sin duplicar las existentes', async () => {
    const { addTablesFromSchema, policyToModel, validateModel } = await import('./mysql-policy-editor');
    const m = policyToModel(JSON.stringify(simple)); // ya trae Usuarios
    const out = addTablesFromSchema(m, schema, ['Usuarios', 'Clientes']);
    expect(out.rows.filter((r) => r.table === 'Usuarios')).toHaveLength(1);
    const c = out.rows.find((r) => r.table === 'Clientes')!;
    expect(c.columns).toBe('k_cliente, ciudad');
    // Sin filtro elegido: no se puede guardar hasta que el operador lo defina.
    expect(validateModel(out).some((e) => e.table === 'Clientes' && /Columna de filtro/.test(e.message))).toBe(true);
    c.scopeColumn = 'k_cliente';
    expect(validateModel(out)).toEqual([]);
  });

  it('respeta las columnas elegidas a mano', async () => {
    const { addTablesFromSchema, policyToModel } = await import('./mysql-policy-editor');
    const out = addTablesFromSchema(policyToModel(JSON.stringify(simple)), schema, ['Clientes'], { Clientes: ['ciudad'] });
    expect(out.rows.find((r) => r.table === 'Clientes')!.columns).toBe('ciudad');
  });
});
