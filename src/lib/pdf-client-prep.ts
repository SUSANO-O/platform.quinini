'use client';

/** Utilidades en el navegador: comprimir PDF y extraer texto sin subir el binario. */

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

export type PdfCompressResult = {
  file: File;
  savedBytes: number;
  savedPercent: number;
};

/** Reempaqueta el PDF (pdf-lib). Útil si el original tiene metadatos/streaming ineficiente. */
export async function compressPdfFile(file: File): Promise<PdfCompressResult | null> {
  if (!isPdfFile(file)) return null;

  const { PDFDocument } = await import('pdf-lib');
  const input = await file.arrayBuffer();
  const src = await PDFDocument.load(input, { ignoreEncryption: true, updateMetadata: false });
  const dst = await PDFDocument.create();
  const pages = await dst.copyPages(src, src.getPageIndices());
  pages.forEach((page) => dst.addPage(page));
  const output = await dst.save({ useObjectStreams: true, addDefaultPage: false });

  if (output.byteLength >= input.byteLength * 0.97) return null;

  const compressed = new File([new Uint8Array(output)], file.name, {
    type: 'application/pdf',
    lastModified: Date.now(),
  });

  return {
    file: compressed,
    savedBytes: input.byteLength - output.byteLength,
    savedPercent: Math.round((1 - output.byteLength / input.byteLength) * 100),
  };
}

/** Extrae texto en el cliente (pdf.js). Evita subir PDFs pesados cuando solo importa el contenido. */
export async function extractPdfTextInBrowser(file: File): Promise<string> {
  if (!isPdfFile(file)) throw new Error('Solo se puede extraer texto de PDF.');

  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const parts: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
      .join(' ')
      .trim();
    if (pageText) parts.push(pageText);
  }

  const text = parts.join('\n\n').replace(/\s+/g, ' ').trim();
  if (!text) {
    throw new Error('No se encontró texto en el PDF (puede ser escaneado). Prueba un PDF con texto seleccionable.');
  }
  return text;
}

export type PreparedUpload =
  | { mode: 'file'; file: File; note?: string }
  | { mode: 'text'; text: string; filename: string; originalSize: number; note: string };

export type PrepareUploadOptions = {
  maxDirectBytes: number;
  maxFileBytes: number;
  blobEnabled: boolean;
  onStatus?: (message: string) => void;
};

/**
 * Prepara un archivo para subida:
 * 1) comprime PDF si ayuda
 * 2) si sigue grande y no hay Blob, extrae texto en el navegador
 */
export async function prepareFileForRagUpload(file: File, options: PrepareUploadOptions): Promise<PreparedUpload> {
  const { maxDirectBytes, maxFileBytes, blobEnabled, onStatus } = options;
  let candidate = file;

  if (isPdfFile(file) && file.size > maxDirectBytes * 0.85) {
    onStatus?.('Comprimiendo PDF…');
    try {
      const compressed = await compressPdfFile(file);
      if (compressed) {
        candidate = compressed.file;
        onStatus?.(`PDF comprimido: ${formatMb(file.size)} MB → ${formatMb(candidate.size)} MB (−${compressed.savedPercent}%)`);
      }
    } catch {
      onStatus?.('No se pudo comprimir; se intentará otra vía.');
    }
  }

  if (candidate.size <= maxFileBytes && (blobEnabled || candidate.size <= maxDirectBytes)) {
    return {
      mode: 'file',
      file: candidate,
      note: candidate !== file ? 'compressed' : undefined,
    };
  }

  if (isPdfFile(file) && !blobEnabled && file.size > maxDirectBytes) {
    onStatus?.('PDF grande: extrayendo texto en tu navegador (no se sube el archivo)…');
    const text = await extractPdfTextInBrowser(file);
    return {
      mode: 'text',
      text,
      filename: file.name,
      originalSize: file.size,
      note: 'text-extract',
    };
  }

  if (isPdfFile(file) && blobEnabled && candidate.size > maxDirectBytes) {
    onStatus?.('Subiendo archivo grande…');
  }

  return { mode: 'file', file: candidate };
}

export { isPdfFile, formatMb };
