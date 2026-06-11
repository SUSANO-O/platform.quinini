/** URL pública del servicio agent-flow-api (documentación + REST /api/v1). */
export function getAgentflowApiUrl(): string {
  const fromEnv =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_AGENTFLOW_API_URL?.trim() : '';
  // En Windows, localhost suele resolver a ::1 y puede chocar con un API viejo en Docker.
  const raw = fromEnv || 'http://127.0.0.1:4000';
  return raw.replace(/\/$/, '');
}

export function getAgentflowApiDocsUrl(): string {
  return `${getAgentflowApiUrl()}/docs/`;
}
