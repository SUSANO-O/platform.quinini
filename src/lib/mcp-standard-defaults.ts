/**
 * Valores por defecto para la integración `mcp_standard` (MCP Server estándar).
 * Definidos en .env — ver .env.example (NEXT_PUBLIC_* se inyectan en el cliente).
 */
export function getMcpStandardDefaultServerUrl(): string {
  return (process.env.NEXT_PUBLIC_MCP_STANDARD_DEFAULT_URL ?? '').trim();
}
