/**
 * GET /api/widgets/[id]/feedback/list — respuestas de la encuesta de un widget (dueño).
 * Auth: cookie afhub_session. Devuelve resumen + lista paginada para el modal del dashboard.
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget, WidgetFeedback } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10) || 50));

  await connectDB();

  // Verificar que el widget es del usuario.
  const widget = await Widget.findOne({ _id: id, userId }).select({ _id: 1 }).lean();
  if (!widget) return NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 });

  const items = await WidgetFeedback.find({ widgetId: id, userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select({ score: 1, answers: 1, createdAt: 1, sessionId: 1 })
    .lean();

  // Resumen agregado.
  const scored = items.filter((i) => typeof i.score === 'number') as Array<{ score: number }>;
  const avgScore = scored.length
    ? Math.round((scored.reduce((s, i) => s + i.score, 0) / scored.length) * 10) / 10
    : null;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const i of scored) {
    const r = Math.round(i.score);
    if (r >= 1 && r <= 5) distribution[r] += 1;
  }

  return NextResponse.json({
    summary: { avgScore, totalResponses: items.length, scoredResponses: scored.length, distribution },
    items,
  });
}
