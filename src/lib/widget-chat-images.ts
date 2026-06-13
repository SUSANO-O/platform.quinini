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

  // Mantener el mensaje del usuario limpio; el OCR/visión se inyecta vía
  // sessionContextBlock + systemPromptOverride en mergeVisionContextIntoBody().
  parsed.message = userText || 'El usuario adjuntó una imagen.';
  delete parsed.userImages;

  const enrichment: WidgetImageEnrichment = {
    images,
    analyses,
    displayMessage: userText || '📎 Imagen adjunta',
  };

  return { body: JSON.stringify(parsed), enrichment };
}
