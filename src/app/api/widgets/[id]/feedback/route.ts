/**
 * POST /api/widgets/[id]/feedback
 * El visitante envía las respuestas de la encuesta de satisfacción al final de la conversación.
 *
 * Body: { sessionId?, visitorId?, agentId?, answers: [{ questionId, value }] }
 * Header: X-Widget-Token (wt_*)  (o token en body)
 *
 * El questionText/type se resuelve en el servidor desde widget.feedbackQuestions
 * (no se confía en el cliente). Score = promedio de respuestas tipo 'rating'.
 * Idempotente: 1 feedback por sessionId.
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Widget, WidgetFeedback, ConversationSession } from '@/lib/db/models';
import { getCorsHeaders, handlePreflight, withCors } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

interface FeedbackQuestion {
  id: string;
  text: string;
  type: 'rating' | 'choice' | 'text' | 'yesno';
  options?: string[];
  enabled?: boolean;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    visitorId?: string;
    agentId?: string;
    token?: string;
    answers?: Array<{ questionId?: string; value?: unknown }>;
  };

  const token = (req.headers.get('x-widget-token') || body.token || '').trim();
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const answersIn = Array.isArray(body.answers) ? body.answers : [];

  await connectDB();

  const widget = await Widget.findById(id)
    .select({ userId: 1, afhubToken: 1, active: 1, agentId: 1, feedbackQuestions: 1, feedbackEnabled: 1 })
    .lean() as {
      userId?: string;
      afhubToken?: string;
      active?: boolean;
      agentId?: string;
      feedbackEnabled?: boolean;
      feedbackQuestions?: FeedbackQuestion[];
    } | null;

  if (!widget) {
    return withCors(req, NextResponse.json({ error: 'Widget no encontrado.' }, { status: 404 }));
  }
  // Validar token del widget.
  if (!token || (widget.afhubToken && token !== widget.afhubToken)) {
    return withCors(req, NextResponse.json({ error: 'Token inválido.' }, { status: 401 }));
  }
  if (widget.feedbackEnabled === false) {
    return withCors(req, NextResponse.json({ error: 'Encuesta no habilitada.' }, { status: 403 }));
  }

  // Idempotencia: una respuesta por sesión.
  if (sessionId) {
    const existing = await WidgetFeedback.exists({ widgetId: id, sessionId });
    if (existing) {
      return withCors(req, NextResponse.json({ ok: true, duplicate: true }));
    }
  }

  // Resolver preguntas desde la config del widget (fuente de verdad).
  const questionsById = new Map<string, FeedbackQuestion>();
  for (const q of widget.feedbackQuestions ?? []) {
    if (q?.id) questionsById.set(q.id, q);
  }

  const answers: Array<{ questionId: string; questionText: string; type: string; value: unknown }> = [];
  const ratings: number[] = [];

  for (const a of answersIn) {
    const qid = typeof a?.questionId === 'string' ? a.questionId : '';
    const q = questionsById.get(qid);
    if (!q || q.enabled === false) continue;
    let value: unknown = a.value;
    if (q.type === 'rating') {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < 1 || n > 5) continue;
      value = n;
      ratings.push(n);
    } else if (q.type === 'text') {
      value = typeof value === 'string' ? value.trim().slice(0, 2000) : '';
      if (!value) continue;
    } else if (q.type === 'yesno') {
      value = String(value) === 'true' || value === 'Sí' || value === 'si' || value === true ? 'Sí' : 'No';
    } else if (q.type === 'choice') {
      const opt = typeof value === 'string' ? value.trim() : '';
      if (!opt || (Array.isArray(q.options) && q.options.length > 0 && !q.options.includes(opt))) continue;
      value = opt;
    } else {
      continue;
    }
    answers.push({ questionId: q.id, questionText: q.text, type: q.type, value });
  }

  if (answers.length === 0) {
    return withCors(req, NextResponse.json({ error: 'Sin respuestas válidas.' }, { status: 400 }));
  }

  const score = ratings.length ? Math.round((ratings.reduce((s, n) => s + n, 0) / ratings.length) * 10) / 10 : null;

  await WidgetFeedback.create({
    widgetId: id,
    userId: String(widget.userId || ''),
    agentId: widget.agentId ? String(widget.agentId) : typeof body.agentId === 'string' ? body.agentId : '',
    sessionId,
    visitorId: typeof body.visitorId === 'string' ? body.visitorId : '',
    score,
    answers,
  });

  // Reflejar el score en la sesión (analytics).
  if (sessionId && score != null) {
    ConversationSession.updateOne({ chatSessionId: sessionId }, { $set: { satisfactionScore: score } }).catch(() => {});
  }

  return withCors(req, NextResponse.json({ ok: true, score }));
}
