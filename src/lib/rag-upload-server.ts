import type { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { getAgentLimits } from '@/lib/agent-plans';

type AgentDoc = InstanceType<typeof ClientAgent>;

export type RagUploadContext =
  | { ok: true; userId: string; agent: AgentDoc; limits: ReturnType<typeof getAgentLimits> }
  | { ok: false; error: string; status: number };

export async function getRagUploadContext(req: NextRequest, agentId: string): Promise<RagUploadContext> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return { ok: false, error: 'No autenticado.', status: 401 };

  const userId = verifySessionToken(token);
  if (!userId) return { ok: false, error: 'Sesión inválida.', status: 401 };

  await connectDB();

  const agent = await ClientAgent.findOne({ _id: agentId, userId });
  if (!agent) return { ok: false, error: 'Agente no encontrado.', status: 404 };

  if (agent.isPlatform) {
    return {
      ok: false,
      error:
        'Los agentes de plataforma no se pueden modificar desde la landing. Edita el conocimiento en AgentFlowHub.',
      status: 403,
    };
  }

  const sub = await Subscription.findOne({ userId }).lean() as { plan?: string; status?: string } | null;
  const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
  const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';
  const limits = getAgentLimits(plan);

  return { ok: true, userId, agent, limits };
}

export function ragUploadUserIdFromRequest(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
