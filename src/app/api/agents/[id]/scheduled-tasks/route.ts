/**
 * GET  /api/agents/[id]/scheduled-tasks   — lista las tareas programadas del agente
 * POST /api/agents/[id]/scheduled-tasks   — crea una tarea (valida límite por plan)
 *
 * El worker `cron-schedule` (Cloud Run) ejecuta estas tareas; aquí solo se gestionan.
 */
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { connectDB } from '@/lib/db/connection';
import { Subscription, ClientAgent, ScheduledTask, User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

function hashSecurityCode(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex');
}
import {
  DEFAULT_TIMEZONE,
  validateCron,
  validateCronInterval,
  computeNextRun,
  scheduledTasksEnabled,
  effectiveScheduledTaskLimit,
  getScheduledTaskMinIntervalMin,
} from '@/lib/scheduling';
import { sanitizeAction, sanitizeRetryPolicy } from '@/lib/scheduled-task-validation';

type Params = { params: Promise<{ id: string }> };

async function getAuth(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Resuelve el agente del usuario (acepta _id o agentHubId). */
async function findOwnedAgent(id: string, userId: string) {
  const isObjectId = mongoose.Types.ObjectId.isValid(id);
  let agent = isObjectId ? await ClientAgent.findOne({ _id: id, userId }).lean() : null;
  if (!agent) agent = await ClientAgent.findOne({ agentHubId: id, userId }).lean();
  return agent;
}

/** Acceso al feature: plan ≥ Plus, override en suscripción, o rol admin. */
async function resolveAccess(userId: string): Promise<{ hasAccess: boolean; plan: string; limit: number }> {
  const [sub, user] = await Promise.all([
    Subscription.findOne({ userId }).lean() as Promise<
      { plan?: string; status?: string; features?: string[]; scheduledTaskLimit?: number | null } | null
    >,
    User.findById(userId).select({ role: 1 }).lean() as Promise<{ role?: string } | null>,
  ]);
  const plan = sub?.status === 'active' || sub?.status === 'trialing' ? sub?.plan ?? 'free' : 'free';
  const hasAccess = user?.role === 'admin' || scheduledTasksEnabled(plan, sub?.features);
  const limit = effectiveScheduledTaskLimit(plan, hasAccess, sub?.scheduledTaskLimit);
  return { hasAccess, plan, limit };
}

export async function GET(req: NextRequest, { params }: Params) {
  const userId = await getAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const agent = await findOwnedAgent(id, userId);
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  const rawTasks = await ScheduledTask.find({ agentId: String(agent._id), userId })
    .sort({ createdAt: -1 })
    .lean();

  // Nunca exponer el hash al cliente — solo indicar si tiene código configurado.
  const tasks = rawTasks.map(({ securityCodeHash, ...t }) => ({
    ...t,
    hasSecurityCode: Boolean(securityCodeHash),
  }));

  // Acceso por plan/override/admin para que la UI decida (lista vs. tarjeta de upsell).
  const { hasAccess, plan, limit } = await resolveAccess(userId);

  return NextResponse.json({ tasks, access: { hasAccess, limit, plan } });
}

export async function POST(req: NextRequest, { params }: Params) {
  const userId = await getAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const agent = await findOwnedAgent(id, userId);
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });
  const agentId = String(agent._id);

  // ── Acceso + límite por plan (override de admin vía features[] o rol admin) ──
  const { hasAccess, plan, limit } = await resolveAccess(userId);
  if (!hasAccess) {
    return NextResponse.json(
      {
        error: 'Las Tareas Programadas están disponibles desde el plan Plus. Actualiza tu suscripción para activarlas.',
        code: 'SCHEDULED_TASK_NO_ACCESS',
      },
      { status: 403 },
    );
  }
  const existingCount = await ScheduledTask.countDocuments({ agentId, userId });
  if (limit >= 0 && existingCount >= limit) {
    return NextResponse.json(
      {
        error: `Tu plan ${plan} permite máximo ${limit} tarea${limit === 1 ? '' : 's'} programada${limit === 1 ? '' : 's'} por agente. Actualiza tu suscripción para crear más.`,
        code: 'SCHEDULED_TASK_LIMIT',
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 160) : '';
  if (!name) return NextResponse.json({ error: 'El nombre es requerido.' }, { status: 400 });

  const cron = typeof body.cron === 'string' ? body.cron.trim() : '';
  const timezone = typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone.trim() : DEFAULT_TIMEZONE;
  const cronCheck = validateCron(cron, timezone);
  if (!cronCheck.ok) return NextResponse.json({ error: cronCheck.error }, { status: 400 });

  const intervalCheck = validateCronInterval(cron, timezone, getScheduledTaskMinIntervalMin(plan));
  if (!intervalCheck.ok) {
    return NextResponse.json({ error: intervalCheck.error, code: 'SCHEDULED_TASK_INTERVAL' }, { status: 400 });
  }

  const actionCheck = sanitizeAction(body.action);
  if (!actionCheck.ok) return NextResponse.json({ error: actionCheck.error }, { status: 400 });

  const retryPolicy = sanitizeRetryPolicy(body.retryPolicy);
  const enabled = body.enabled !== false;

  const rawCode = typeof body.securityCode === 'string' ? body.securityCode.trim() : '';
  const securityCodeHash = rawCode ? hashSecurityCode(rawCode) : null;

  const task = await ScheduledTask.create({
    agentId,
    userId,
    widgetId: typeof body.widgetId === 'string' ? body.widgetId : '',
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : '',
    name,
    enabled,
    cron,
    timezone,
    action: actionCheck.value,
    retryPolicy,
    status: enabled ? 'idle' : 'paused',
    attempts: 0,
    nextRunAt: enabled ? computeNextRun(cron, timezone) : null,
    securityCodeHash,
  });

  return NextResponse.json({ task }, { status: 201 });
}
