/**
 * Análisis de capturas de pantalla del widget (OCR + contexto de soporte) vía Gemini Vision.
 */

const SUPPORT_VISION_PROMPT =
  'Analiza esta captura de pantalla de soporte técnico. Extrae:\n' +
  '1. Todos los mensajes de error visibles (texto exacto, sin parafrasear)\n' +
  '2. Códigos HTTP, URLs, IDs de error o stack traces parciales\n' +
  '3. Elementos de UI relevantes (botones, formularios, estados)\n' +
  'Responde en el mismo idioma que predomine en la imagen. ' +
  'Formato: secciones breves con viñetas. Solo contenido extraído, sin explicaciones meta.';

function getVertexApiKey(): string | null {
  return process.env.VERTEX_GEMINI_API_KEY?.trim() || null;
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), mimeType };
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  const m = /^data:(image\/[^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  return { mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

async function callVertexVision(buffer: Buffer, mimeType: string, prompt: string): Promise<string> {
  const apiKey = getVertexApiKey();
  if (!apiKey) {
    return '[Imagen adjunta — configura VERTEX_GEMINI_API_KEY para análisis automático de capturas.]';
  }

  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType, data: buffer.toString('base64') } },
        { text: prompt },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 4096 },
  };

  const res = await fetch(`${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vision API error: ${res.status} - ${errText}`);
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}

/** Analiza imagen desde URL de Cloudinary o data URL. */
export async function analyzeSupportScreenshot(source: string): Promise<string> {
  try {
    let buffer: Buffer;
    let mimeType: string;

    if (source.startsWith('data:image/')) {
      const parsed = parseDataUrl(source);
      if (!parsed) return '[Formato de imagen no válido.]';
      buffer = parsed.buffer;
      mimeType = parsed.mimeType;
    } else {
      const fetched = await fetchImageBuffer(source);
      buffer = fetched.buffer;
      mimeType = fetched.mimeType;
    }

    const text = await callVertexVision(buffer, mimeType, SUPPORT_VISION_PROMPT);
    return text || '[No se detectó texto legible en la captura.]';
  } catch (err) {
    console.error('[widget-image-vision] analyzeSupportScreenshot:', err);
    return '[Error al analizar la captura — el agente humano puede revisar la imagen adjunta.]';
  }
}
