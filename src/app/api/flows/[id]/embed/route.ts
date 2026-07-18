import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ConversationFlow } from '@/lib/db/models';
import { getCorsHeaders, handlePreflight, withCors } from '@/lib/cors';
import { flowAccessDeniedMessage, resolveFlowAccessForUser } from '@/lib/flow-access';

type RouteCtx = { params: Promise<{ id: string }> };

function readFlowToken(req: NextRequest): string {
  return req.nextUrl.searchParams.get('token')?.trim()
    || req.headers.get('x-flow-token')?.trim()
    || '';
}

export async function OPTIONS(req: NextRequest) {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const flowToken = readFlowToken(req);
  if (!flowToken) {
    return withCors(req, NextResponse.json({ error: 'Token de flujo requerido.' }, { status: 401 }));
  }

  const { id } = await ctx.params;
  await connectDB();

  const doc = await ConversationFlow.findOne({ _id: id, embedToken: flowToken }).lean();
  if (!doc) {
    return withCors(req, NextResponse.json({ error: 'Flujo no encontrado.' }, { status: 404 }));
  }
  if (doc.status !== 'published') {
    return withCors(req, NextResponse.json({ error: 'El flujo no está publicado.' }, { status: 403 }));
  }

  const ownerAccess = await resolveFlowAccessForUser(doc.userId);
  if (!ownerAccess.hasAccess) {
    return withCors(req, NextResponse.json({ error: flowAccessDeniedMessage(), code: 'FLOW_PLAN_REQUIRED' }, { status: 403 }));
  }

  return withCors(req, NextResponse.json({
    flow: {
      id: String(doc._id),
      name: doc.name,
      description: doc.description ?? '',
      completionMessage: doc.completionMessage ?? '',
      nodes: doc.nodes ?? [],
      connections: doc.connections ?? [],
    },
  }));
}
