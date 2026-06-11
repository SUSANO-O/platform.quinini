/**
 * POST /api/ai/generate-avatar
 *
 * Genera avatar vía Pollinations (Flux). Requiere POLLINATIONS_API_KEY (gen.pollinations.ai).
 * Devuelve data URL para evitar CORS y cargas directas en el cliente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';

export const maxDuration = 60;

function buildFluxPrompt(description: string): string {
  const base = description.trim();
  return `${base}, professional photo, sharp focus, high quality, clean background, natural lighting, 8k`;
}

function pollinationsImageUrl(prompt: string, seed: number, apiKey: string): string {
  const params = new URLSearchParams({
    width: '512',
    height: '512',
    seed: String(seed),
    model: 'flux',
    key: apiKey,
  });
  return `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${params.toString()}`;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token || !verifySessionToken(token)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Generación AI no configurada. Añade POLLINATIONS_API_KEY en el servidor o sube una imagen manualmente.',
        code: 'POLLINATIONS_NOT_CONFIGURED',
      },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null) as {
    description?: string;
    agentContext?: { name?: string; purpose?: string; industry?: string };
  } | null;

  if (!body?.description?.trim()) {
    return NextResponse.json({ error: 'description es requerido.' }, { status: 400 });
  }

  const prompt = buildFluxPrompt(body.description);
  const seed = Math.floor(Math.random() * 99_999) + 1;
  const imageUrl = pollinationsImageUrl(prompt, seed, apiKey);

  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(55_000) });
    if (!imgRes.ok) {
      const hint =
        imgRes.status === 402
          ? 'Saldo Pollinations insuficiente (402). Recarga créditos en enter.pollinations.ai o sube una imagen manualmente.'
          : `Pollinations respondió ${imgRes.status}. Intenta más tarde o sube una imagen.`;
      return NextResponse.json({ error: hint, code: 'POLLINATIONS_ERROR', status: imgRes.status }, { status: 502 });
    }
    const buf = await imgRes.arrayBuffer();
    const mime = imgRes.headers.get('content-type') || 'image/jpeg';
    const dataUrl = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
    return NextResponse.json({ url: dataUrl, prompt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error de red';
    return NextResponse.json(
      { error: `No se pudo generar la imagen: ${msg}`, code: 'POLLINATIONS_FETCH_FAILED' },
      { status: 504 },
    );
  }
}
