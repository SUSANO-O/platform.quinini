/**
 * POST /api/flows/[id]/classify — nodo "Clasificar con IA" del flujo (src/lib/flow-classify.ts).
 * Body: { flowToken, nodeId, text } → { index, label?, method }   (index -1 = rama "Otro")
 *
 * Las categorías se leen del flujo guardado (nunca del navegador). Limitado por IP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationFlow } from '@/lib/db/models';
import { getCorsHeaders, handlePreflight, withCors } from '@/lib/cors';
import { flowAccessDeniedMessage, resolveFlowAccessForUser } from '@/lib/flow-access';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';
import { classifyFlowText, type FlowCategory } from '@/lib/flow-classify';
import { callInternalLlm } from '@/lib/widget-multi-agent';

type RouteCtx = { params: Promise<{ id: string }> };

export async function OPTIONS(req: NextRequest) {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const rl = await checkRateLimitAsync('flow-classify', getClientIp(req), 30, 60_000);
  if (!rl.success) return withCors(req, NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429 }));

  let body: { flowToken?: string; nodeId?: string; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return withCors(req, NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }));
  }
  const flowToken = (body.flowToken || req.headers.get('x-flow-token') || '').trim();
  const nodeId = typeof body.nodeId === 'string' ? body.nodeId.trim() : '';
  const text = typeof body.text === 'string' ? body.text.slice(0, 500) : '';
  if (!flowToken || !nodeId) return withCors(req, NextResponse.json({ error: 'Faltan datos.' }, { status: 400 }));

  await connectDB();
  const flow = (await ConversationFlow.findOne({ _id: id, embedToken: flowToken }).lean()) as
    | { userId: string; status?: string; nodes?: Array<Record<string, unknown>> }
    | null;
  if (!flow) return withCors(req, NextResponse.json({ error: 'Flujo no encontrado.' }, { status: 404 }));
  if (flow.status !== 'published') return withCors(req, NextResponse.json({ error: 'El flujo no está publicado.' }, { status: 403 }));
  if (!(await resolveFlowAccessForUser(flow.userId)).hasAccess) {
    return withCors(req, NextResponse.json({ error: flowAccessDeniedMessage(), code: 'FLOW_PLAN_REQUIRED' }, { status: 403 }));
  }

  const node = (flow.nodes ?? []).find((n) => n?.id === nodeId && n?.type === 'ai_classify');
  if (!node) return withCors(req, NextResponse.json({ error: 'Nodo no encontrado.' }, { status: 404 }));
  const categories: FlowCategory[] = (Array.isArray(node.options) ? node.options : [])
    .map((o) => o as Record<string, unknown>)
    .filter((o) => typeof o.label === 'string' && o.label.trim())
    .map((o) => ({
      label: String(o.label).trim().slice(0, 80),
      value: String(o.value ?? '').slice(0, 60),
      ...(typeof o.description === 'string' && o.description.trim() ? { description: o.description.trim().slice(0, 200) } : {}),
    }))
    .slice(0, 12);

  const result = await classifyFlowText({
    categories,
    text,
    llm: (prompt) => callInternalLlm(prompt, 256, 0, 10_000), // 2.5-flash "piensa": con topes bajos devuelve vacío
  });
  return withCors(
    req,
    NextResponse.json({
      index: result.index,
      method: result.method,
      ...(result.index >= 0 ? { label: categories[result.index].label } : {}),
    }),
  );
}
