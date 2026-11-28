/**
 * Copia de una hoja de Google Sheets a Mongo SIN tener la hoja entera en memoria.
 *
 * Antes: se juntaban hasta 350 000 filas en un array, se borraba el snapshot anterior y se insertaba
 * todo de golpe. Con hojas grandes la instancia (512 MB) se quedaba sin memoria cada noche y, como el
 * borrado iba primero, el agente se quedaba sin los datos de esa hoja.
 *
 * Ahora: se descarga por tramos y cada bloque de `chunkRows` filas se escribe en cuanto se completa
 * (reemplazando el bloque con el mismo índice). Solo al final se borran los bloques sobrantes del
 * snapshot anterior. Si el proceso muere a mitad, el snapshot viejo sigue ahí (mezclado con bloques
 * nuevos), nunca vacío. En memoria hay como mucho un bloque + un tramo.
 */

export type SheetFetchChunk = (
  fromRow: number,
  rows: number,
  includeHeader: boolean,
) => Promise<{ header: string[]; rows: string[][]; lineCount: number } | null>;

export type SheetChunkWriter = (chunk: {
  chunkIndex: number;
  header: string[];
  rows: string[][];
}) => Promise<void>;

export type SheetStreamResult = {
  header: string[];
  rowCount: number;
  chunks: number;
  complete: boolean;
  byteSize: number;
};

export function estimateSheetBytes(header: string[], rows: string[][]): number {
  let n = 0;
  for (const h of header) n += Buffer.byteLength(h, 'utf8');
  for (const row of rows) {
    for (const cell of row) n += Buffer.byteLength(cell, 'utf8') + 1;
  }
  return n;
}

export async function streamSheetToChunks(opts: {
  fetchChunk: SheetFetchChunk;
  writeChunk: SheetChunkWriter;
  fetchRows: number;
  chunkRows: number;
  maxRows: number;
  /** Solo leer y contar, sin escribir (dryRun). */
  dryRun?: boolean;
}): Promise<SheetStreamResult> {
  const { fetchChunk, writeChunk, fetchRows, chunkRows, maxRows, dryRun } = opts;
  let header: string[] = [];
  let buffer: string[][] = [];
  let rowCount = 0;
  let chunks = 0;
  let byteSize = 0;
  let from = 1;
  let hitEnd = false;

  const flush = async () => {
    if (!buffer.length) return;
    const rows = buffer;
    buffer = [];
    byteSize += estimateSheetBytes([], rows);
    if (!dryRun) await writeChunk({ chunkIndex: chunks, header, rows });
    chunks++;
  };

  while (rowCount < maxRows) {
    const take = Math.min(fetchRows, maxRows - rowCount);
    const chunk = await fetchChunk(from, take, from === 1);
    if (!chunk || chunk.lineCount === 0) {
      hitEnd = true;
      break;
    }
    if (from === 1 && chunk.header.length) header = chunk.header;
    if (!chunk.rows.length) {
      hitEnd = true;
      break;
    }
    for (const row of chunk.rows) {
      buffer.push(row);
      rowCount++;
      if (buffer.length >= chunkRows) await flush();
    }
    from += take;
    if (chunk.lineCount < take) {
      hitEnd = true;
      break;
    }
  }
  await flush();
  byteSize += estimateSheetBytes(header, []);

  return { header, rowCount, chunks, complete: hitEnd && rowCount < maxRows, byteSize };
}
