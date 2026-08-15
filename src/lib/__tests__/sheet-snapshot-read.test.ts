import { describe, expect, it } from 'vitest';
import { readSheetFromSnapshot, snapshotCanServeSearch } from '@/lib/sheet-snapshot-read';

const HEADER = ['referencia', 'marca_vehiculo', 'modelo'];
const ROWS = [
  ['REP-1', 'Chevrolet', 'Tracker'],
  ['REP-2', 'Ford', 'Ranger'],
];

describe('snapshotCanServeSearch', () => {
  it('un snapshot incompleto (399 Chevrolet) no sustituye la búsqueda live', () => {
    expect(snapshotCanServeSearch({ complete: false, rowCount: 399 })).toBe(false);
    expect(snapshotCanServeSearch({ rowCount: 399 })).toBe(false);
  });

  it('solo el sync terminado sirve { search } desde Mongo', () => {
    expect(snapshotCanServeSearch({ complete: true, rowCount: 300_000 })).toBe(true);
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
