/**
 * Enriquecimiento del mensaje del widget con análisis de capturas (Cloudinary + Gemini Vision).
 */

import { analyzeSupportScreenshot } from '@/lib/widget-image-vision';

export type WidgetUserImage = {
  url: string;
  mimeType?: string;
  publicId?: string;
};

export type WidgetImageEnrichment = {
  images: WidgetUserImage[];
  analyses: Array<{ url: string; text: string }>;
  displayMessage: string;
};

const MAX_USER_IMAGES = 3;

export function parseUserImages(body: Record<string, unknown>): WidgetUserImage[] {
  if (!Array.isArray(body.userImages)) return [];
  const out: WidgetUserImage[] = [];
  for (const item of body.userImages.slice(0, MAX_USER_IMAGES)) {
    if (!item || typeof item !== 'object') continue;
    const url = typeof (item as { url?: unknown }).url === 'string'
      ? (item as { url: string }).url.trim()
      : '';
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const mimeType =
      typeof (item as { mimeType?: unknown }).mimeType === 'string'
        ? (item as { mimeType: string }).mimeType
        : undefined;
    const publicId =
      typeof (item as { publicId?: unknown }).publicId === 'string'
        ? (item as { publicId: string }).publicId
        : undefined;
    out.push({ url, mimeType, publicId });
  }
  return out;
}

/**
 * Si el body incluye userImages, analiza con visión y enriquece message para el hub.
 */
export async function enrichWidgetChatBodyWithImages(
  rawBody: string,
): Promise<{ body: string; enrichment: WidgetImageEnrichment | null }> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { body: rawBody, enrichment: null };
  }

  const images = parseUserImages(parsed);
  if (!images.length) return { body: rawBody, enrichment: null };

  const userText =
    typeof parsed.message === 'string' ? parsed.message.trim() : '';

  const analyses: Array<{ url: string; text: string }> = [];
  for (const img of images) {
    const text = await analyzeSupportScreenshot(img.url);
    analyses.push({ url: img.url, text });
  }

  const imageBlock = analyses
    .map((a, i) => {
      const header = images.length > 1 ? `Imagen ${i + 1}` : 'Imagen adjunta';
      return `[${header}]\nURL: ${a.url}\nContenido detectado:\n${a.text}`;
    })
    .join('\n\n---\n\n');

  let enrichedMessage: string;

  if (!userText) {
    // Sin instrucciones del usuario → pedir al LLM que pregunte qué quiere hacer
    enrichedMessage = [
      '[El usuario ha adjuntado una imagen sin especificar instrucciones.]',
      '',
      '---',
      '[IMAGEN RECIBIDA — SIN INSTRUCCIONES]',
      imageBlock,
      '---',
      'Instrucciones para el asistente: El usuario envió esta imagen pero no indicó qué quiere que hagas con ella.',
      'Preséntate de forma amigable, confirma brevemente lo que ves en la imagen (1 línea) y luego pregúntale',
      'qué desea que hagas: analizarla, extraer texto, describir su contenido, responder una pregunta, etc.',
      'NO realices ningún análisis completo hasta que el usuario indique qué necesita.',
    ].join('\n');
  } else {
    // Con instrucciones → flujo original de soporte
    enrichedMessage = [
      userText,
      '',
      '---',
      '[IMÁGENES DEL USUARIO — CONTEXTO PARA SOPORTE]',
      imageBlock,
      '---',
      'Instrucciones: usa el contenido detectado para diagnosticar y proponer pasos concretos.',
      'Si no puedes resolver con certeza, indica al usuario que pulse "Hablar con una persona" para escalar a un agente humano.',
    ].join('\n');
  }

  parsed.message = enrichedMessage.slice(0, 12_000);
  delete parsed.userImages;

  const enrichment: WidgetImageEnrichment = {
    images,
    analyses,
    displayMessage: userText || '📎 Imagen adjunta',
  };

  return { body: JSON.stringify(parsed), enrichment };
}
