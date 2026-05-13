/**
 * Integraciones MCP de fuentes de datos (MongoDB / Postgres del cliente).
 * Se fusionan en el catálogo que devuelve AIBackHub si el hub aún no publica estas claves.
 * La ejecución real de tools (`mongo_*`, `pg_*`) debe implementarse en AIBackHub.
 *
 * @see docs/aibackhub-mcp-data-sources.md
 */

export type McpDataSourceCredentialField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
};

/** Forma mínima compatible con `McpLandingConnectForm` y filas del catálogo. */
export type McpInternalDataSourceCatalogEntry = {
  key: string;
  name: string;
  description: string;
  toolIdPrefix: string;
  credentialFields: McpDataSourceCredentialField[];
  docsUrl?: string;
  banners?: { variant?: string; text: string; linkUrl?: string; linkLabel?: string }[];
};

const READONLY_WARNING =
  'Recomendado: usuario de base de datos solo lectura. El hub aplicará accessMode y maxRows al ejecutar tools.';

export const INTERNAL_DATA_SOURCE_MCP_CATALOG_ENTRIES: McpInternalDataSourceCatalogEntry[] = [
  {
    key: 'mongodb',
    name: 'MongoDB (cliente)',
    description:
      'Exploración y consultas de solo lectura (por defecto) sobre un clúster MongoDB del cliente. Las tools se ejecutan en AIBackHub con la política del enlace.',
    toolIdPrefix: 'mongo_',
    credentialFields: [
      {
        key: 'connectionUri',
        label: 'MongoDB connection URI',
        secret: true,
        required: true,
      },
      {
        key: 'accessMode',
        label: 'Modo (read_only | read_write; vacío = read_only)',
        secret: false,
        required: false,
      },
      {
        key: 'maxRows',
        label: 'Máx. filas por respuesta (vacío = 500 en el hub)',
        secret: false,
        required: false,
      },
      {
        key: 'allowedDatabases',
        label: 'Bases permitidas (coma, vacío = todas; el hub puede restringir)',
        secret: false,
        required: false,
      },
    ],
    banners: [{ variant: 'warning', text: READONLY_WARNING }],
  },
  {
    key: 'postgres',
    name: 'PostgreSQL (cliente)',
    description:
      'Exploración y SQL de solo lectura (por defecto) sobre PostgreSQL del cliente. Dialecto: Postgres. Las tools se ejecutan en AIBackHub.',
    toolIdPrefix: 'pg_',
    credentialFields: [
      {
        key: 'connectionUri',
        label: 'PostgreSQL connection URI (postgresql://…)',
        secret: true,
        required: true,
      },
      {
        key: 'accessMode',
        label: 'Modo (read_only | read_write; vacío = read_only)',
        secret: false,
        required: false,
      },
      {
        key: 'maxRows',
        label: 'Máx. filas por respuesta (vacío = 500 en el hub)',
        secret: false,
        required: false,
      },
      {
        key: 'allowedSchemas',
        label: 'Esquemas permitidos (coma, vacío = todos salvo system)',
        secret: false,
        required: false,
      },
    ],
    banners: [{ variant: 'warning', text: READONLY_WARNING }],
  },
];

export function mergeInternalDataSourceMcpCatalog<T extends { key: string }>(catalog: T[]): T[] {
  const keys = new Set(catalog.map((c) => c.key));
  const out = [...catalog];
  for (const entry of INTERNAL_DATA_SOURCE_MCP_CATALOG_ENTRIES) {
    if (!keys.has(entry.key)) {
      keys.add(entry.key);
      out.push(entry as unknown as T);
    }
  }
  return out;
}

/** Tools que el hub debería registrar / devolver en sync para cada integración. */
export const DATA_SOURCE_MCP_TOOL_IDS: Record<string, string[]> = {
  mongodb: [
    'mongo_list_database_names',
    'mongo_list_collections',
    'mongo_collection_indexes',
    'mongo_find',
    'mongo_aggregate_readonly',
  ],
  postgres: [
    'pg_list_schemas',
    'pg_list_tables',
    'pg_describe_table',
    'pg_select_readonly',
  ],
};
