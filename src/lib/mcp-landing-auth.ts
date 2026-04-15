/**
 * Autenticación y resolución de agente AIBackHub para operaciones MCP desde la landing.
 */

import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';

export async function getSessionUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Agente editable por el usuario (no agente de plataforma; mismo criterio que PATCH /api/agents/[id]).
 */
export async function getWritableLandingAgent(landingAgentId: string, userId: string) {
  await connectDB();
  if (!mongoose.Types.ObjectId.isValid(landingAgentId)) return null;
  const agent = await ClientAgent.findOne({
    _id: landingAgentId,
    userId,
    isPlatform: { $ne: true },
  }).lean();
  return agent;
}

/**
 * ID de agente en AIBackHub para colgar conexiones MCP (mismo criterio que /api/mcp/agent-tools).
 */
export async function resolveHubAgentIdForMcp(landingAgentId: string): Promise<string | null> {
  await connectDB();
  const agent = await ClientAgent.findById(landingAgentId).select('agentHubId').lean();
  if (!agent) return null;
  if (typeof agent.agentHubId === 'string' && agent.agentHubId.trim()) {
    return agent.agentHubId.trim();
  }
  const base = getAibackhubBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/agents`, {
      headers: hubCreateHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const agents: { id: string; landingClientAgentId?: string }[] = body?.data ?? body ?? [];
    for (const a of agents) {
      if (a.landingClientAgentId === landingAgentId) return a.id;
    }
  } catch {
    return null;
  }
  return landingAgentId;
}

/**
 * Comprueba en AIBackHub que la conexión pertenece al ClientAgent de la landing (`_id` hex 24).
 * Evita fallos cuando `mcp_connections.agentId` es el slug del catálogo y el listado por id fallaba.
 */
export async function verifyConnectionBelongsToLandingAgent(
  connectionId: string,
  landingClientAgentId: string,
): Promise<boolean> {
  const base = getAibackhubBaseUrl();
  if (!base) return false;
  try {
    const url = `${base}/api/mcp/connections/${encodeURIComponent(connectionId)}/belongs-to-landing?landingClientAgentId=${encodeURIComponent(landingClientAgentId)}`;
    const res = await fetch(url, {
      headers: hubCreateHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { belongs?: boolean };
      belongs?: boolean;
    };
    const belongs = data?.data?.belongs ?? data?.belongs;
    return belongs === true;
  } catch {
    return false;
  }
}

/** @deprecated Usa `verifyConnectionBelongsToLandingAgent` con el `_id` landing (hex). */
export const verifyConnectionBelongsToHubAgent = verifyConnectionBelongsToLandingAgent;
