import { describe, expect, it } from 'vitest';
import { estimateSheetBytes, streamSheetToChunks, type SheetFetchChunk } from '../sheet-sync-stream';

/** Hoja falsa de `total` filas; el primer tramo trae encabezado. */
function fakeSheet(total: number, calls: number[] = []): SheetFetchChunk {
  return async (from, take, includeHeader) => {
    calls.push(from);
    const start = from - 1;
    const rows: string[][] = [];
    for (let i = start; i < Math.min(total, start + take); i++) rows.push([`r${i}`, 'x']);
    return { header: includeHeader ? ['a', 'b'] : [], rows, lineCount: rows.length };
  };
}

describe('streamSheetToChunks (sync de Sheets con memoria acotada)', () => {
  it('escribe cada bloque en cuanto se completa: nunca junta la hoja entera', async () => {
    const written: { chunkIndex: number; rows: number }[] = [];
    let maxPending = 0;
    let fetched = 0;
    const base = fakeSheet(10_000);
    const r = await streamSheetToChunks({
      fetchRows: 800,
      chunkRows: 4000,
      maxRows: 350_000,
      fetchChunk: async (f, t, h) => {
        const c = await base(f, t, h);
        fetched += c!.rows.length;
        const writtenRows = written.reduce((s, w) => s + w.rows, 0);
        maxPending = Math.max(maxPending, fetched - writtenRows);
        return c;
      },
      writeChunk: async ({ chunkIndex, rows, header }) => {
        expect(header).toEqual(['a', 'b']);
        written.push({ chunkIndex, rows: rows.length });
      },
    });
    expect(written).toEqual([
      { chunkIndex: 0, rows: 4000 },
      { chunkIndex: 1, rows: 4000 },
      { chunkIndex: 2, rows: 2000 },
    ]);
    expect(maxPending).toBeLessThanOrEqual(4000 + 800);
    expect(r).toMatchObject({ rowCount: 10_000, chunks: 3, complete: true, header: ['a', 'b'] });
  });

  it('si falla a mitad, lo ya escrito queda y no hay borrado previo (el error sube)', async () => {
    const written: number[] = [];
    const base = fakeSheet(20_000);
    await expect(
      streamSheetToChunks({
        fetchRows: 800,
        chunkRows: 4000,
        maxRows: 350_000,
        fetchChunk: async (f, t, h) => {
          if (f > 9000) throw new Error('timeout Google');
          return base(f, t, h);
        },
        writeChunk: async ({ chunkIndex }) => {
          written.push(chunkIndex);
        },
      }),
    ).rejects.toThrow('timeout Google');
    expect(written).toEqual([0, 1]);
  });

  it('respeta el máximo de filas y marca incompleto', async () => {
    const r = await streamSheetToChunks({
      fetchRows: 800, chunkRows: 4000, maxRows: 5000,
      fetchChunk: fakeSheet(100_000), writeChunk: async () => {},
    });
    expect(r.rowCount).toBe(5000);
    expect(r.complete).toBe(false);
  });

  it('dryRun cuenta sin escribir; los bytes coinciden con el cálculo de siempre', async () => {
    let writes = 0;
    const r = await streamSheetToChunks({
      fetchRows: 800, chunkRows: 4000, maxRows: 350_000, dryRun: true,
      fetchChunk: fakeSheet(1234), writeChunk: async () => { writes++; },
    });
    expect(writes).toBe(0);
    const rows = Array.from({ length: 1234 }, (_, i) => [`r${i}`, 'x']);
    expect(r.byteSize).toBe(estimateSheetBytes(['a', 'b'], rows));
  });

  it('hoja vacía o inaccesible: sin escrituras', async () => {
    let writes = 0;
    const r = await streamSheetToChunks({
      fetchRows: 800, chunkRows: 4000, maxRows: 350_000,
      fetchChunk: async () => null, writeChunk: async () => { writes++; },
    });
    expect(writes).toBe(0);
    expect(r).toMatchObject({ rowCount: 0, chunks: 0, header: [] });
  });
});
