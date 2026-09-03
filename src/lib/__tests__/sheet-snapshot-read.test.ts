import { describe, expect, it } from 'vitest';
import {
  readSheetFromSnapshot,
  snapshotCanServeSearch,
  type SheetSnapshotDoc,
} from '@/lib/sheet-snapshot-read';

const HEADER = ['referencia', 'marca_vehiculo', 'modelo'];
const ROWS = [
  ['REP-1', 'Chevrolet', 'Tracker'],
  ['REP-2', 'Ford', 'Ranger'],
];

describe('snapshotCanServeSearch', () => {
  // La función solo mira `complete`, pero el rowCount documenta el escenario
  // real (399 Chevrolet vs el catálogo entero). Tipar el snapshot evita que el
  // chequeo de propiedades en exceso obligue a borrar ese contexto.
  const snap = (over: Partial<SheetSnapshotDoc>): SheetSnapshotDoc => ({
    header: [],
    rows: [],
    ...over,
  });

  it('un snapshot incompleto (399 Chevrolet) no sustituye la búsqueda live', () => {
    expect(snapshotCanServeSearch(snap({ complete: false, rowCount: 399 }))).toBe(false);
    expect(snapshotCanServeSearch(snap({ rowCount: 399 }))).toBe(false);
  });

  it('solo el sync terminado sirve { search } desde Mongo', () => {
    expect(snapshotCanServeSearch(snap({ complete: true, rowCount: 300_000 }))).toBe(true);
  });
});

describe('readSheetFromSnapshot', () => {
  it('encuentra Ford en el snapshot completo', () => {
    const out = readSheetFromSnapshot(
      { header: HEADER, rows: ROWS, complete: true },
      { search: 'Ford' },
    );
    expect(out.ok).toBe(true);
    expect(out.returnedRows).toBe(1);
    expect(out.csv).toContain('Ranger');
  });
});
