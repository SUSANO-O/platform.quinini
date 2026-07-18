/**
 * Análisis de capturas de pantalla del widget (OCR + contexto de soporte) vía Gemini Vision.
 */

import {
  buildPlatformUiMatchVisionPrompt,
  getPlatformUiReferenceShots,
} from '@/lib/botiva-platform-ui-reference';
import {
  buildSupportVisionPrompt,
  type WidgetScreenshotContext,
} from '@/lib/widget-image-vision-context';

export type AnalyzeScreenshotOptions = {
  /** Math-ais / agente de plataforma: comparar con referencias UI BotIvA. */
  platformAssist?: boolean;
  appOrigin?: string;
};

type VisionPart =
  | { inlineData: { mimeType: string; data: string } }
  | { text: string };

function getVisionApiKeys(): string[] {
  const keys = [
    process.env.VERTEX_GEMINI_API_KEY?.trim(),
    process.env.GEMINI_API_KEY?.trim(),
  ].filter((k): k is string => Boolean(k));
  return [...new Set(keys)];
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

async function callGeminiVision(parts: VisionPart[], maxOutputTokens = 4096): Promise<string> {
  const apiKeys = getVisionApiKeys();
  if (!apiKeys.length) {
    return '[Imagen adjunta — configura VERTEX_GEMINI_API_KEY o GEMINI_API_KEY para análisis automático de capturas.]';
  }

  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  const body = {
    contents: [{ parts }],
    generationConfig: { temperature: 0, maxOutputTokens },
  };

  let lastErr: Error | null = null;
  for (const apiKey of apiKeys) {
    const res = await fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      lastErr = new Error(`Vision API error: ${res.status} - ${errText}`);
      if (res.status === 429 && apiKeys.length > 1) {
        console.warn('[widget-image-vision] Vision 429, probando clave alternativa…');
        continue;
      }
      throw lastErr;
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
  }

  throw lastErr ?? new Error('Vision API failed');
}

async function loadUserImage(source: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (source.startsWith('data:image/')) {
    const parsed = parseDataUrl(source);
    if (!parsed) throw new Error('INVALID_DATA_URL');
    return parsed;
  }
  return fetchImageBuffer(source);
}

async function analyzePlatformAssistScreenshot(
  userBuffer: Buffer,
  userMime: string,
  screenshotContext: WidgetScreenshotContext,
  options?: AnalyzeScreenshotOptions,
): Promise<string> {
  const refs = getPlatformUiReferenceShots(options?.appOrigin);
  const loadedRefs: Array<{ label: string; buffer: Buffer; mimeType: string }> = [];

  for (const ref of refs) {
    try {
      const { buffer, mimeType } = await fetchImageBuffer(ref.url);
      loadedRefs.push({ label: ref.label, buffer, mimeType });
    } catch {
      console.warn('[widget-image-vision] Referencia UI omitida (no accesible):', ref.url.slice(0, 80));
    }
  }

  const parts: VisionPart[] = [];
  for (const ref of loadedRefs) {
    parts.push({ text: `[REFERENCIA BOTIVA] ${ref.label}` });
    parts.push({
      inlineData: { mimeType: ref.mimeType, data: ref.buffer.toString('base64') },
    });
  }

  parts.push({ text: '[CAPTURA DEL USUARIO — analizar y clasificar]' });
  parts.push({
    inlineData: { mimeType: userMime, data: userBuffer.toString('base64') },
  });

  parts.push({
    text: buildPlatformUiMatchVisionPrompt({
      screenshotContextPagePath: screenshotContext.pagePath,
      referenceLabels: loadedRefs.map((r) => r.label),
    }),
  });

  console.log(
    `[widget-image-vision] Math-ais UI match: ${loadedRefs.length} ref(s), user ${userMime} ${userBuffer.length}b`,
  );
  return callGeminiVision(parts, 4096);
}

/** Analiza imagen desde URL de Cloudinary o data URL. */
export async function analyzeSupportScreenshot(
  source: string,
  screenshotContext?: WidgetScreenshotContext,
  options?: AnalyzeScreenshotOptions,
): Promise<string> {
  const ctx =
    screenshotContext ??
    ({
      kind: 'visitor_site',
      pagePath: '',
      originLabel:
        'Captura enviada por un visitante desde el chat widget BotIvA (canal oficial de adjuntos del producto).',
    } as WidgetScreenshotContext);

  const usePlatformMatch =
    options?.platformAssist === true && ctx.kind === 'botiva_dashboard';

  try {
    const { buffer, mimeType } = await loadUserImage(source);
    console.log(`[widget-image-vision] Imagen lista: ${mimeType} ${buffer.length} bytes`);

    let text: string;
    if (usePlatformMatch) {
      text = await analyzePlatformAssistScreenshot(buffer, mimeType, ctx, options);
    } else {
      const visionPrompt = buildSupportVisionPrompt(ctx);
      text = await callGeminiVision(
        [
          { inlineData: { mimeType, data: buffer.toString('base64') } },
          { text: visionPrompt },
        ],
        4096,
      );
    }

    console.log(`[widget-image-vision] Respuesta Vision (${text.length} chars): ${text.slice(0, 100)}`);
    return text || '[No se detectó contenido en la imagen.]';
  } catch (err) {
    console.error('[widget-image-vision] ERROR analyzeSupportScreenshot:', err);
    return '[No se pudo analizar la imagen.]';
  }
}
