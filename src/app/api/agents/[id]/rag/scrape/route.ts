/**
 * POST /api/agents/[id]/rag/scrape
 * Adaptador HTTP — delega toda la lógica a @/lib/scraper.
 * Requiere plan con ragEnabled (Starter o superior).
 * Registra cada intento en AuditLog para trazabilidad completa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { scrape } from '@/lib/scraper';
import { connectDB } from '@/lib/db/connection';
import { Subscription } from '@/lib/db/models';
import { getAgentLimits } from '@/lib/agent-plans';
import { recordAudit } from '@/lib/audit-log';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(req);

  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  // Rate limit: 30 scrapes por hora por usuario
  const rl = checkRateLimit('rag-scrape', userId, 30, 60 * 60 * 1000);
  if (!rl.success) {
    await recordAudit({
      userId,
      action: 'rag.scrape.rate_limited',
      resource: 'rag/scrape',
      meta: { retryAfter: rl.retryAfter },
      ip,
    });
    return NextResponse.json(
      { error: `Límite de scraping alcanzado. Intenta en ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  // Verificar que el plan del usuario permite RAG/scraping
  await connectDB();
  const sub = await Subscription.findOne({ userId }).lean() as { plan?: string; status?: string } | null;
  const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
  const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';
  const limits = getAgentLimits(plan);

  if (!limits.ragEnabled) {
    await recordAudit({
      userId,
      action: 'rag.scrape.blocked',
      resource: 'rag/scrape',
      meta: { plan, reason: 'plan_not_eligible' },
      ip,
    });
    return NextResponse.json(
      { error: 'El scraping de URL requiere el plan Starter o superior. Actualiza tu suscripción para usar esta función.' },
      { status: 403 },
    );
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

    // Registrar el scraping exitoso con todos los detalles
    await recordAudit({
      userId,
      action: 'rag.scrape',
      resource: url,
      meta: {
        plan,
        title: result.title,
        charCount: result.charCount,
        blockCount: result.blocks?.length ?? 0,
        extractedBy: result.extractedBy,
      },
      ip,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';

    // Registrar el fallo también
    await recordAudit({
      userId,
      action: 'rag.scrape.failed',
      resource: url,
      meta: { plan, error: msg },
      ip,
    });

    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
