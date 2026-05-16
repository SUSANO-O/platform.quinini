/**
 * POST /api/agents/[id]/rag/scrape
 * Adaptador HTTP — delega toda la lógica a @/lib/scraper.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { scrape } from '@/lib/scraper';

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token || !verifySessionToken(token)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { url?: string };
  const url = body.url?.trim() ?? '';

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return NextResponse.json(
      { error: 'URL inválida. Debe empezar con http:// o https://' },
      { status: 400 }
    );
  }

  try {
    const result = await scrape(url);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
