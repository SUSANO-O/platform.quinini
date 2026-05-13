/**
 * GET  /api/agents/[id]/ab-tests        → listar tests del agente
 * POST /api/agents/[id]/ab-tests        → crear nuevo test
 * PUT  /api/agents/[id]/ab-tests        → actualizar (pausar/reanudar/archivar, editar variantes)
 * DELETE /api/agents/[id]/ab-tests?testId= → eliminar test
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { AbTest, ClientAgent } from '@/lib/db/models';
import crypto from 'crypto';

function auth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

type Params = { params: Promise<{ id: string }> };

async function ownsAgent(agentId: string, userId: string): Promise<boolean> {
  const agent = await ClientAgent.findById(agentId).select({ userId: 1 }).lean() as
    | { userId?: string } | null;
  return agent?.userId === userId;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id: agentId } = await params;
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  if (!(await ownsAgent(agentId, userId))) {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
  }

  const tests = await AbTest.find({ agentId, userId })
    .select({ name: 1, status: 1, variants: 1, startedAt: 1, stoppedAt: 1 })
    .sort({ startedAt: -1 })
    .lean();

  return NextResponse.json({ tests });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: agentId } = await params;
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  if (!(await ownsAgent(agentId, userId))) {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
  }

  const body = await req.json() as {
    name?: string;
    variants?: { label: string; systemPrompt: string; trafficPct: number }[];
  };

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'name requerido.' }, { status: 400 });

  const rawVariants = body.variants;
  if (!Array.isArray(rawVariants) || rawVariants.length < 2) {
    return NextResponse.json({ error: 'Se requieren al menos 2 variantes.' }, { status: 400 });
  }

  const totalPct = rawVariants.reduce((s, v) => s + (v.trafficPct || 0), 0);
  if (Math.abs(totalPct - 100) > 1) {
    return NextResponse.json({ error: 'trafficPct debe sumar 100.' }, { status: 400 });
  }

  // Only one running test per agent
  const running = await AbTest.findOne({ agentId, status: 'running' }).select({ _id: 1 }).lean();
  if (running) {
    return NextResponse.json({ error: 'Ya hay un test en ejecución para este agente.' }, { status: 409 });
  }

  const variants = rawVariants.map((v) => ({
    id: crypto.randomBytes(4).toString('hex'),
    label: v.label?.trim() || 'Variante',
    systemPrompt: v.systemPrompt?.trim() || '',
    trafficPct: v.trafficPct,
    sessions: 0,
    escalations: 0,
    positiveResponses: 0,
    avgDurationSec: 0,
  }));

  const test = await AbTest.create({
    agentId,
    userId,
    name,
    status: 'running',
    variants,
    startedAt: new Date(),
  });

  return NextResponse.json({ ok: true, testId: String(test._id), name: test.name, variants: test.variants }, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id: agentId } = await params;
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  await connectDB();
  if (!(await ownsAgent(agentId, userId))) {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
  }

  const body = await req.json() as {
    testId?: string;
    action?: 'stop' | 'archive' | 'restart';
    name?: string;
  };

  if (!body.testId) return NextResponse.json({ error: 'testId requerido.' }, { status: 400 });

  const test = await AbTest.findOne({ _id: body.testId, agentId, userId });
  if (!test) return NextResponse.json({ error: 'Test no encontrado.' }, { status: 404 });

  if (body.action === 'stop') {
    test.status = 'stopped';
    test.stoppedAt = new Date();
  } else if (body.action === 'archive') {
    test.status = 'archived';
    test.stoppedAt = test.stoppedAt || new Date();
  } else if (body.action === 'restart') {
    const running = await AbTest.findOne({ agentId, status: 'running', _id: { $ne: test._id } }).lean();
    if (running) return NextResponse.json({ error: 'Ya hay un test en ejecución.' }, { status: 409 });
    test.status = 'running';
    test.stoppedAt = undefined;
    test.startedAt = new Date();
    // Reset metrics
    for (const v of test.variants) {
      v.sessions = 0;
      v.escalations = 0;
      v.positiveResponses = 0;
      v.avgDurationSec = 0;
    }
  }

  if (body.name?.trim()) test.name = body.name.trim();

  await test.save();
  return NextResponse.json({ ok: true, status: test.status });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: agentId } = await params;
  const userId = auth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const url = new URL(req.url);
  const testId = url.searchParams.get('testId');
  if (!testId) return NextResponse.json({ error: 'testId requerido.' }, { status: 400 });

  await connectDB();
  if (!(await ownsAgent(agentId, userId))) {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
  }

  const result = await AbTest.deleteOne({ _id: testId, agentId, userId });
  if (result.deletedCount === 0) return NextResponse.json({ error: 'Test no encontrado.' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
