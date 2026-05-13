import { mergeInternalDataSourceMcpCatalog } from '@/lib/mcp-internal-data-sources-catalog';

function extractCatalogArray(data: Record<string, unknown>): { key: string }[] {
  const inner = data.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const c = (inner as { catalog?: unknown }).catalog;
    if (Array.isArray(c)) return c as { key: string }[];
  }
  if (Array.isArray(data.catalog)) return data.catalog as { key: string }[];
  return [];
}

/**
 * Inserta entradas `mongodb` / `postgres` si el hub aún no las envía.
 */
export function mergeDataSourcesIntoHubCatalogPayload(data: Record<string, unknown>): Record<string, unknown> {
  const raw = extractCatalogArray(data);
  const merged = mergeInternalDataSourceMcpCatalog(raw);

  const inner = data.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return {
      ...data,
      data: { ...(inner as Record<string, unknown>), catalog: merged },
    };
  }
  return { ...data, catalog: merged };
}
