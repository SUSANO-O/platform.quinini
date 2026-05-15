/**
 * POST /api/ai/generate-avatar
 *
 * Genera una imagen de avatar via pollinations.ai (Flux) usando la
 * descripción del usuario directamente, sin pasar por el hub.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';

export const maxDuration = 60;

/** Añade modificadores de calidad en inglés sin sobreescribir la intención del usuario. */
function buildFluxPrompt(description: string): string {
  const base = description.trim();
  // Append quality modifiers that Flux understands well
  return `${base}, professional photo, sharp focus, high quality, clean background, natural lighting, 8k`;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token || !verifySessionToken(token)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    description?: string;
    agentContext?: { name?: string; purpose?: string; industry?: string };
  } | null;

  if (!body?.description?.trim()) {
    return NextResponse.json({ error: 'description es requerido.' }, { status: 400 });
  }

  const prompt = buildFluxPrompt(body.description);
  const seed   = Math.floor(Math.random() * 99_999) + 1;
  const imageUrl =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=512&height=512&seed=${seed}&nologo=true&model=flux`;

  // Proxy the image so the browser gets a data URL immediately (no 20-30s wait in <img>)
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(55_000) });
    if (imgRes.ok) {
      const buf     = await imgRes.arrayBuffer();
      const mime    = imgRes.headers.get('content-type') || 'image/jpeg';
      const dataUrl = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
      return NextResponse.json({ url: dataUrl, prompt });
    }
  } catch {
    // timeout o error de red — devuelve la URL directa como fallback
  }

  return NextResponse.json({ url: imageUrl, prompt });
}
