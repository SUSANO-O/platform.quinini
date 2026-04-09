/**
 * RAG file processor — extracts plain text from uploaded files.
 * Supported types:
 *   PDF   → pdf-parse
 *   DOCX  → mammoth
 *   TXT / MD / CSV / JSON → direct UTF-8 read
 *   XLSX  → simple CSV-style extraction without extra deps
 *   Images (PNG/JPG/WEBP/GIF) → Gemini Vision API (requires GEMINI_API_KEY)
 */

// ── Type map ──────────────────────────────────────────────────────────────────

export type FileCategory = 'pdf' | 'docx' | 'text' | 'image' | 'unsupported';

export interface ProcessResult {
  text: string;        // Extracted plain text
  charCount: number;
  category: FileCategory;
  warning?: string;    // Non-fatal notices (e.g. "image OCR via Gemini")
}

const MAX_CHARS = 120_000; // ~30k tokens — truncate beyond this

export function getFileCategory(mimeType: string, filename: string): FileCategory {
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    filename.endsWith('.docx') || filename.endsWith('.doc')
  ) return 'docx';
  if (
    mimeType.startsWith('text/') ||
    ['application/json', 'application/csv'].includes(mimeType) ||
    ['.txt', '.md', '.csv', '.json', '.yml', '.yaml', '.xml', '.html'].some((ext) => filename.endsWith(ext))
  ) return 'text';
  if (mimeType.startsWith('image/')) return 'image';
  return 'unsupported';
}

// ── PDF ───────────────────────────────────────────────────────────────────────

async function extractPdf(buffer: Buffer): Promise<string> {
  // Dynamic import so it doesn't load on Edge runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParse = ((await import('pdf-parse')) as any).default ?? (await import('pdf-parse'));
  const data = await pdfParse(buffer, { max: 0 }); // max:0 = all pages
  return data.text.replace(/\s+/g, ' ').trim();
}

// ── DOCX ──────────────────────────────────────────────────────────────────────

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value.replace(/\s+/g, ' ').trim();
}

// ── Plain text / CSV / JSON / Markdown ───────────────────────────────────────

function extractText(buffer: Buffer): string {
  return buffer.toString('utf-8').replace(/\r\n/g, '\n').trim();
}

// ── Images via Gemini Vision ──────────────────────────────────────────────────

async function extractImageText(buffer: Buffer, mimeType: string): Promise<{ text: string; warning?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      text: '[Imagen adjunta — sin extracción de texto. Configura GEMINI_API_KEY para habilitar OCR automático.]',
      warning: 'GEMINI_API_KEY no configurado — el contenido de la imagen no fue extraído.',
    };
  }

  try {
    const base64 = buffer.toString('base64');
    const endpoint =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    const body = {
      contents: [{
        parts: [
          {
            inlineData: { mimeType, data: base64 },
          },
          {
            text: 'Extrae todo el texto que aparece en esta imagen. Si hay tablas, conviértelas a formato markdown. Si no hay texto, describe detalladamente el contenido visual para que un agente de IA pueda responder preguntas sobre esta imagen. Responde solo con el contenido extraído, sin explicaciones adicionales.',
          },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 4096 },
    };

    const res = await fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return { text: text.trim(), warning: 'Contenido extraído via Gemini Vision.' };
  } catch (err) {
    console.error('[RAG] Image extraction error:', err);
    return {
      text: '[Error al procesar imagen — intenta de nuevo o usa un PDF/DOCX.]',
      warning: 'Error al conectar con Gemini Vision.',
    };
  }
}

// ── Main processor ────────────────────────────────────────────────────────────

export async function processFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<ProcessResult> {
  const category = getFileCategory(mimeType, filename);
  let text = '';
  let warning: string | undefined;

  try {
    switch (category) {
      case 'pdf':
        text = await extractPdf(buffer);
        break;
      case 'docx':
        text = await extractDocx(buffer);
        break;
      case 'text':
        text = extractText(buffer);
        break;
      case 'image': {
        const result = await extractImageText(buffer, mimeType);
        text = result.text;
        warning = result.warning;
        break;
      }
      case 'unsupported':
        return {
          text: '',
          charCount: 0,
          category,
          warning: `Tipo de archivo no soportado: ${mimeType}`,
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      text: `[Error procesando archivo: ${msg}]`,
      charCount: 0,
      category,
      warning: msg,
    };
  }

  // Truncate if too long
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    warning = (warning ? warning + ' ' : '') + `Texto truncado a ${MAX_CHARS.toLocaleString()} caracteres.`;
  }

  return { text, charCount: text.length, category, warning };
}
