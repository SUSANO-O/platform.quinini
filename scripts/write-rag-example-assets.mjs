/**
 * Genera archivos de ejemplo en public/assets/exampleRAG/ (solo Node).
 * Ejecutar: npm run gen:rag-examples
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../public/assets/exampleRAG');

const TXT = `=== EJEMPLO RAG — TEXTO PLANO ===
Producto: Filtro aceite Pro (SKU-001)

Compatibilidad:
- Volkswagen Fox 2005–2012
- Gol 1.0 (motor EA111)

Política de devolución:
Plazo 30 días con empaque original. No aceptamos piezas instaladas.
`;

const JSON_SAMPLE = `{
  "titulo_catalogo": "Ejemplo RAG — JSON",
  "items": [
    {
      "sku": "SKU-001",
      "nombre": "Filtro aceite Pro",
      "precio_lista_usd": 45,
      "notas": "Compatible Fox 2005–2012. Revisar manual del vehículo."
    },
    {
      "sku": "SKU-002",
      "nombre": "Kit pastillas delanteras",
      "precio_lista_usd": 89.99,
      "notas": "Stock bajo; reposición estimada 2026-06."
    }
  ]
}
`;

const CSV = `sku,nombre,precio_lista,stock,notas
SKU-001,Filtro aceite Pro,45.00,120,"Compatible: Fox 2005–2012"
SKU-002,Kit pastillas delanteras,89.99,0,"Reposición prevista 2026-06"
`;

const OOXML = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
  'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Ejemplo RAG — Word (.docx)</w:t></w:r></w:p>
    <w:p><w:r><w:t>Usa títulos con estilos de Word y listas con viñetas. Frases cortas con etiquetas claras mejoran la recuperación en el RAG.</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Producto</w:t></w:r></w:p>
    <w:p><w:r><w:t>Filtro aceite Pro — SKU-001. Compatibilidad: Fox 2005–2012.</w:t></w:r></w:p>
    <w:p><w:r><w:t>• Paso 1: Verificar número de motor.</w:t></w:r></w:p>
    <w:p><w:r><w:t>• Paso 2: Comparar con tabla del fabricante.</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`,
};

/** PNG 1×1 transparente (válido para probar subida / OCR en imágenes con más resolución). */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l1GWDQAAAABJRU5ErkJggg==',
  'base64',
);

async function writePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = [
    'Ejemplo RAG — PDF',
    '',
    'Usa texto seleccionable (no solo imágenes escaneadas sin OCR).',
    'Encabezados y párrafos cortos ayudan al índice.',
    '',
    'Producto: Filtro aceite Pro (SKU-001)',
    'Compatibilidad: Fox 2005–2012.',
  ];
  let y = 780;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 11, font });
    y -= 16;
  }
  const bytes = await doc.save();
  fs.writeFileSync(path.join(OUT, 'ejemplo-rag.pdf'), bytes);
}

function writeDocx() {
  return new Promise((resolve, reject) => {
    const dest = path.join(OUT, 'ejemplo-rag.docx');
    const output = fs.createWriteStream(dest);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    for (const [name, body] of Object.entries(OOXML)) {
      archive.append(body, { name });
    }
    archive.finalize();
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'ejemplo-rag.txt'), TXT, 'utf8');
  fs.writeFileSync(path.join(OUT, 'ejemplo-rag.json'), JSON_SAMPLE, 'utf8');
  fs.writeFileSync(path.join(OUT, 'ejemplo-rag.csv'), CSV, 'utf8');
  fs.writeFileSync(path.join(OUT, 'ejemplo-rag-ocr.png'), PNG_1X1);

  await writePdf();
  await writeDocx();

  console.log('OK →', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
