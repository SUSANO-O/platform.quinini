/**
 * Análisis de capturas de pantalla del widget (OCR + contexto de soporte) vía Gemini Vision.
 */

const SUPPORT_VISION_PROMPT =
  'Describe detalladamente el contenido de esta imagen. Incluye:\n' +
  '1. Qué objetos, productos o elementos aparecen\n' +
  '2. Texto visible (exacto, sin parafrasear)\n' +
  '3. Colores, formas, marcas o características relevantes\n' +
  '4. Contexto general de la imagen\n' +
  'Responde en español. Formato: descripción clara y concisa. Solo describe lo que ves, sin opiniones ni explicaciones adicionales.';

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

  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
      if (!parsed) {
        console.error('[widget-image-vision] Formato de data URL inválido');
        return '[Formato de imagen no válido.]';
      }
      buffer = parsed.buffer;
      mimeType = parsed.mimeType;
      console.log(`[widget-image-vision] data URL: ${mimeType} ${buffer.length} bytes`);
    } else {
      console.log(`[widget-image-vision] Descargando imagen: ${source.slice(0, 80)}`);
      const fetched = await fetchImageBuffer(source);
      buffer = fetched.buffer;
      mimeType = fetched.mimeType;
      console.log(`[widget-image-vision] Imagen descargada: ${mimeType} ${buffer.length} bytes`);
    }

    console.log('[widget-image-vision] Llamando Gemini Vision gemini-2.5-flash...');
    const text = await callVertexVision(buffer, mimeType, SUPPORT_VISION_PROMPT);
    console.log(`[widget-image-vision] Respuesta Vision (${text.length} chars): ${text.slice(0, 100)}`);
    return text || '[No se detectó contenido en la imagen.]';
  } catch (err) {
    console.error('[widget-image-vision] ERROR analyzeSupportScreenshot:', err);
    return '[No se pudo analizar la imagen.]';
  }
}
