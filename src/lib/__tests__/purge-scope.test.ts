import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PURGE_CHILDREN,
  PURGE_ROOTS,
  PRESERVED,
  buildOwnershipFilter,
  isOwnId,
  type OwnedIds,
} from '@/modules/account-lifecycle/domain/purge-scope';

const ACC = 'a'.repeat(24);
const AG1 = 'b'.repeat(24);
const W1 = 'c'.repeat(24);
const owned = (o: Partial<OwnedIds> = {}): OwnedIds => ({ accountId: ACC, agentIds: [AG1], widgetIds: [W1], ...o });

describe('buildOwnershipFilter — nunca puede alcanzar a otra cuenta', () => {
  it('combina todos los campos de pertenencia en un $or con ids propios', () => {
    const f = buildOwnershipFilter({ model: 'WidgetMessage', match: ['userId', 'agentId', 'widgetId'] }, owned());
    expect(f).toEqual({ $or: [{ userId: ACC }, { agentId: { $in: [AG1] } }, { widgetId: { $in: [W1] } }] });
  });

  it('tenantId se filtra por el id de la cuenta, jamás por un valor compartido', () => {
    const f = buildOwnershipFilter({ model: 'WebhookDelivery', match: ['tenantId', 'agentId'] }, owned());
    expect(f).toEqual({ $or: [{ tenantId: ACC }, { agentId: { $in: [AG1] } }] });
  });

  it('aborta si el id de la cuenta es un valor compartido como "default"', () => {
    expect(() => buildOwnershipFilter({ model: 'X', match: ['userId'] }, owned({ accountId: 'default' }))).toThrow();
    expect(() => buildOwnershipFilter({ model: 'X', match: ['userId'] }, owned({ accountId: '' }))).toThrow();
  });

  it('aborta si algún id de agente o widget no es propio', () => {
    expect(() => buildOwnershipFilter({ model: 'X', match: ['agentId'] }, owned({ agentIds: ['default'] }))).toThrow();
    expect(() => buildOwnershipFilter({ model: 'X', match: ['widgetId'] }, owned({ widgetIds: [''] }))).toThrow();
  });

  it('sin agentes, omite esa rama en vez de filtrar por una lista vacía', () => {
    const f = buildOwnershipFilter({ model: 'X', match: ['userId', 'agentId'] }, owned({ agentIds: [] }));
    expect(f).toEqual({ userId: ACC });
  });

  it('si no queda ninguna rama devuelve null — nunca un filtro vacío que borre todo', () => {
    const f = buildOwnershipFilter({ model: 'X', match: ['agentId', 'widgetId'] }, owned({ agentIds: [], widgetIds: [] }));
    expect(f).toBeNull();
  });

  it('isOwnId solo acepta ObjectIds', () => {
    expect(isOwnId(ACC)).toBe(true);
    for (const v of ['default', '', 'abc', null, undefined, 123]) expect(isOwnId(v)).toBe(false);
  });
});

// ── Cobertura contra el esquema real ─────────────────────────────────────────
// Si alguien agrega una colección con datos de cliente y no la clasifica, una
// cuenta "borrada" dejaría esos datos huérfanos sin que nadie se entere.
const OWNERSHIP_KEYS = ['userId', 'ownerId', 'tenantId', 'agentId', 'widgetId', 'referrerId', 'createdBy', 'members'];

function schemasWithTopLevelKeys(): Map<string, string[]> {
  const src = readFileSync(resolve(__dirname, '../db/models.ts'), 'utf8');
  const out = new Map<string, string[]>();
  const re = /const (\w+)Schema\s*=\s*new (?:mongoose\.)?Schema(?:<[^>]*>)?\(\s*\{/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 0;
    let j = m.index + m[0].length - 1;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    const body = src.slice(m.index + m[0].length, j);
    const keys: string[] = [];
    let d = 0;
    for (const line of body.split('\n')) {
      if (d === 0) {
        const k = /^\s*(\w+)\s*:/.exec(line);
        if (k) keys.push(k[1]);
      }
      d += (line.match(/[{[]/g)?.length ?? 0) - (line.match(/[}\]]/g)?.length ?? 0);
    }
    out.set(m[1], keys);
  }
  return out;
}

describe('purge scope — cobertura del esquema real', () => {
  const schemas = schemasWithTopLevelKeys();
  const purged = new Set([...PURGE_CHILDREN, ...PURGE_ROOTS].map((t) => t.model));
  const preserved = new Set(PRESERVED.map((p) => p.model));

  it('toda colección con datos de una cuenta está clasificada (se borra o se conserva)', () => {
    const sinClasificar = [...schemas.entries()]
      .filter(([name, keys]) => name !== 'User' && keys.some((k) => OWNERSHIP_KEYS.includes(k)))
      .map(([name]) => name)
      .filter((name) => !purged.has(name) && !preserved.has(name));
    expect(sinClasificar).toEqual([]);
  });

  it('ningún modelo figura a la vez como borrable y como conservado', () => {
    expect([...purged].filter((m) => preserved.has(m))).toEqual([]);
  });

  it('los campos declarados para cada modelo existen de verdad en su esquema', () => {
    const errores: string[] = [];
    for (const t of [...PURGE_CHILDREN, ...PURGE_ROOTS]) {
      const keys = schemas.get(t.model);
      if (!keys) { errores.push(`${t.model}: no existe en models.ts`); continue; }
      for (const f of t.match) if (!keys.includes(f)) errores.push(`${t.model}.${f}`);
    }
    expect(errores).toEqual([]);
  });

  it('las facturas jamás están en el alcance del borrado', () => {
    expect(purged.has('ManualInvoice')).toBe(false);
    expect(preserved.has('ManualInvoice')).toBe(true);
  });
});
