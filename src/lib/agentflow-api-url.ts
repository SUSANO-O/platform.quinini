/** URL pública del servicio agent-flow-api (documentación + REST /api/v1). */
export function getAgentflowApiUrl(): string {
  const raw =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_AGENTFLOW_API_URL) ||
    'http://localhost:4000';
  return String(raw).replace(/\/$/, '');
}

export function getAgentflowApiDocsUrl(): string {
  return `${getAgentflowApiUrl()}/docs/`;
}
