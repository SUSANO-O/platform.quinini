/**
 * GET    /api/agents/[id]/scheduled-tasks/[taskId]   — detalle de una tarea
 * PATCH  /api/agents/[id]/scheduled-tasks/[taskId]   — editar (nombre, horario, acción, reintentos, on/off)
 * DELETE /api/agents/[id]/scheduled-tasks/[taskId]   — borrar
 */
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { connectDB } from '@/lib/db/connection';

function hashSecurityCode(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex');
}
import { ClientAgent, ScheduledTask, TaskExecution, Subscription } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import {
  DEFAULT_TIMEZONE,
  validateCron,
  validateCronInterval,
  computeNextRun,
  getScheduledTaskMinIntervalMin,
} from '@/lib/scheduling';
import { sanitizeAction, sanitizeRetryPolicy } from '@/lib/scheduled-task-validation';

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

export async function GET(req: NextRequest, { params }: Params) {
  const userId = await getAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id, taskId } = await params;
  await connectDB();
  const agentId = await findOwnedAgentId(id, userId);
  if (!agentId) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const rawTask = await ScheduledTask.findOne({ _id: taskId, agentId, userId }).lean();
  if (!rawTask) return NextResponse.json({ error: 'Tarea no encontrada.' }, { status: 404 });

  // Nunca exponer el hash al cliente.
  const { securityCodeHash, ...task } = rawTask as typeof rawTask & { securityCodeHash?: string | null };
  const taskForClient = { ...task, hasSecurityCode: Boolean(securityCodeHash) };

  // Incluir últimas ejecuciones para el dashboard de estado.
  const executions = await TaskExecution.find({ taskId: String(taskId) }).sort({ runAt: -1 }).limit(10).lean();
  return NextResponse.json({ task: taskForClient, executions });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await getAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id, taskId } = await params;
  await connectDB();
  const agentId = await findOwnedAgentId(id, userId);
  if (!agentId) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const task = await ScheduledTask.findOne({ _id: taskId, agentId, userId });
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 160) : '';
    if (!name) return NextResponse.json({ error: 'El nombre no puede estar vacío.' }, { status: 400 });
    task.name = name;
  }

  // Horario: si cambia cron o timezone, recalcular nextRunAt.
  const newCron = typeof body.cron === 'string' ? body.cron.trim() : task.cron;
  const newTz = typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone.trim() : task.timezone || DEFAULT_TIMEZONE;
  const scheduleChanged = newCron !== task.cron || newTz !== task.timezone;
  if (scheduleChanged) {
    const cronCheck = validateCron(newCron, newTz);
    if (!cronCheck.ok) return NextResponse.json({ error: cronCheck.error }, { status: 400 });
    // Validar frecuencia mínima según el plan actual del usuario.
    const sub = (await Subscription.findOne({ userId }).lean()) as { plan?: string; status?: string } | null;
    const plan = sub?.status === 'active' || sub?.status === 'trialing' ? sub?.plan ?? 'free' : 'free';
    const intervalCheck = validateCronInterval(newCron, newTz, getScheduledTaskMinIntervalMin(plan));
    if (!intervalCheck.ok) {
      return NextResponse.json({ error: intervalCheck.error, code: 'SCHEDULED_TASK_INTERVAL' }, { status: 400 });
    }
    task.cron = newCron;
    task.timezone = newTz;
  }

  if ('action' in body) {
    const actionCheck = sanitizeAction(body.action);
    if (!actionCheck.ok) return NextResponse.json({ error: actionCheck.error }, { status: 400 });
    task.action = actionCheck.value;
    task.markModified('action'); // Mixed + then[]: markModified del subdoc completo
  }

  if ('retryPolicy' in body) {
    task.retryPolicy = sanitizeRetryPolicy(body.retryPolicy);
  }

  if (typeof body.widgetId === 'string') task.widgetId = body.widgetId;
  if (typeof body.sessionId === 'string') task.sessionId = body.sessionId;

  // Código de seguridad: cadena vacía = eliminar el código; nueva cadena = reemplazar hash.
  if ('securityCode' in body) {
    const rawCode = typeof body.securityCode === 'string' ? body.securityCode.trim() : '';
    (task as unknown as { securityCodeHash: string | null }).securityCodeHash = rawCode
      ? hashSecurityCode(rawCode)
      : null;
  }

  // On/off: pausar conserva la tarea; reactivar reprograma.
  if ('enabled' in body) {
    const enabled = body.enabled !== false;
    task.enabled = enabled;
    if (!enabled) {
      task.status = 'paused';
      task.nextRetryAt = null;
    } else if (task.status === 'paused') {
      task.status = 'idle';
    }
  }

  // Reprogramar próxima corrida si está habilitada y cambió el horario o se reactivó.
  if (task.enabled && (scheduleChanged || task.status === 'idle')) {
    task.nextRunAt = computeNextRun(task.cron, task.timezone);
    task.nextRetryAt = null;
  }

  await task.save();
  return NextResponse.json({ task });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const userId = await getAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id, taskId } = await params;
  await connectDB();
  const agentId = await findOwnedAgentId(id, userId);
  if (!agentId) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const res = await ScheduledTask.deleteOne({ _id: taskId, agentId, userId });
  if (res.deletedCount === 0) return NextResponse.json({ error: 'Tarea no encontrada.' }, { status: 404 });

  // Limpiar historial asociado (fire-and-forget).
  TaskExecution.deleteMany({ taskId: String(taskId) }).catch(() => {});
  return NextResponse.json({ ok: true });
}
