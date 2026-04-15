/** Respuesta alineada con MCP_INTEGRATION_CATALOG en AIBackHub (GET /api/mcp/catalog). */
export type McpCatalogRow = {
  key: string;
  name: string;
  description: string;
  toolIdPrefix: string;
  docsUrl?: string;
  authMethods?: { id: string; label: string; recommended?: boolean }[];
};
