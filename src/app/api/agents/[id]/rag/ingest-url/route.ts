/**
 * POST /api/agents/[id]/rag/ingest-url  { url }
 *
 * Scrapea una URL Y la guarda como fuente de conocimiento (texto) del agente del usuario.
 * A diferencia de /rag/scrape (que solo devuelve el contenido), este persiste la fuente.
 * Requiere sesión y ser dueño del agente, y que el plan permita RAG.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription } from '@/lib/db/models';
import { getAgentLimits } from '@/lib/agent-plans';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { scrapeUrlToTextSource } from '@/lib/onboarding/provision-lead';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get('afhub_session')?.value;
  const userId = token ? verifySessionToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const rl = checkRateLimit('rag-ingest-url', userId, 20, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json({ error: `Límite alcanzado. Intenta en ${rl.retryAfter}s.` }, { status: 429 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const url = (body.url ?? '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'URL inválida.' }, { status: 400 });
  }

  await connectDB();
  const agent = await ClientAgent.findOne({ _id: id, userId });
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const sub = await Subscription.findOne({ userId }).lean() as { plan?: string; status?: string } | null;
  const hasActive = sub?.status === 'active' || sub?.status === 'trialing';
  const plan = hasActive ? (sub?.plan ?? 'free') : 'free';
  if (!getAgentLimits(plan).ragEnabled) {
    return NextResponse.json({ error: 'Tu plan no incluye conocimiento desde URL.' }, { status: 403 });
  }

  const source = await scrapeUrlToTextSource(url);
  if (!source) return NextResponse.json({ error: 'No se pudo leer la página.' }, { status: 400 });

  agent.ragSources = [...(agent.ragSources ?? []), source];
  agent.ragEnabled = true;
  await agent.save();

  return NextResponse.json({ ok: true, name: source.name, charCount: source.charCount });
}
