/**
 * POST /api/agents/[id]/scheduled-tasks/[taskId]/run
 * "Ejecutar ahora": marca la tarea como vencida (nextRunAt en el pasado) para que
 * el worker cron-schedule la ejecute en el próximo tick (≤ intervalo del scheduler).
 * El landing NO ejecuta acciones; solo encola.
 */
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, ScheduledTask } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

type Params = { params: Promise<{ id: string; taskId: string }> };

async function getAuth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

async function findOwnedAgentId(id: string, userId: string): Promise<string | null> {
  const isObjectId = mongoose.Types.ObjectId.isValid(id);
  let agent = isObjectId ? await ClientAgent.findOne({ _id: id, userId }).select({ _id: 1 }).lean() : null;
  if (!agent) agent = await ClientAgent.findOne({ agentHubId: id, userId }).select({ _id: 1 }).lean();
  return agent ? String(agent._id) : null;
}

export async function POST(req: NextRequest, { params }: Params) {
  const userId = await getAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id, taskId } = await params;
  await connectDB();
  const agentId = await findOwnedAgentId(id, userId);
  if (!agentId) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const task = await ScheduledTask.findOne({ _id: taskId, agentId, userId });
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada.' }, { status: 404 });
  if (!task.enabled) {
    return NextResponse.json(
      { error: 'La tarea está pausada. Actívala antes de ejecutarla.', code: 'TASK_PAUSED' },
      { status: 400 },
    );
  }

  // Marcar como vencida ya: el worker la tomará en el próximo /tick.
  task.nextRunAt = new Date(Date.now() - 1000);
  task.nextRetryAt = null;
  task.lockedAt = null;
  if (task.status !== 'running') task.status = 'idle';
  await task.save();

  return NextResponse.json({
    ok: true,
    message: 'Tarea encolada. Se ejecutará en el próximo ciclo (normalmente en menos de 1 minuto).',
  });
}
