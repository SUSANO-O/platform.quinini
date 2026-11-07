export type AgentToolsAgent = { userId?: unknown; isPlatform?: boolean } | null;

export type AgentToolsAccess = 'owner' | 'admin' | 'platform' | 'denied';

/**
 * Quién puede ver las conexiones MCP de un agente (GET /api/mcp/agent-tools): su dueño o un admin
 * (con credenciales enmascaradas), y cualquier usuario logueado si es un agente de plataforma
 * (sin credenciales). Antes la ruta no pedía sesión: con un agentId cualquiera listaba conexiones
 * y credenciales enmascaradas (4 primeros + 2 últimos caracteres).
 */
export function agentToolsAccess(agent: AgentToolsAgent, userId: string, isAdmin: boolean): AgentToolsAccess {
  if (!agent || !userId) return 'denied';
  if (agent.userId != null && String(agent.userId) === userId) return 'owner';
  if (isAdmin) return 'admin';
  if (agent.isPlatform === true) return 'platform';
  return 'denied';
}
