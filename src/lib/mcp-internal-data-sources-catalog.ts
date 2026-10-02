/**
 * Integraciones MCP de fuentes de datos (MongoDB / Postgres / MySQL del cliente).
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
  {
    key: 'mysql',
    name: 'MySQL (cliente)',
    description:
      'Consultas de solo lectura sobre la base MySQL del cliente (p. ej. AWS RDS). El agente solo ve las tablas y columnas de la política, y las tablas con scope se filtran siempre por el cliente que chatea.',
    toolIdPrefix: 'mcp:mysql:',
    docsUrl: 'https://dev.mysql.com/doc/refman/8.4/en/privileges-provided.html#priv_select',
    credentialFields: [
      { key: 'host', label: 'Host (ej. midb.xxxx.us-east-1.rds.amazonaws.com)', secret: false, required: true },
      { key: 'port', label: 'Puerto (vacío = 3306)', secret: false, required: false },
      { key: 'user', label: 'Usuario (solo lectura)', secret: false, required: true },
      { key: 'password', label: 'Contraseña', secret: true, required: true },
      { key: 'database', label: 'Base de datos', secret: false, required: true },
      { key: 'sslMode', label: 'SSL (rds | verify | required | disabled; vacío = verify)', secret: false, required: false },
      { key: 'sslCa', label: 'CA en PEM (opcional; p. ej. global-bundle.pem de AWS RDS si "rds" falla)', secret: false, required: false },
      { key: 'maxRows', label: 'Máx. filas por respuesta (vacío = 50, tope 500)', secret: false, required: false },
      { key: 'timeZone', label: 'Zona horaria (ej. -05:00 para Colombia; vacío = la del servidor)', secret: false, required: false },
      {
        key: 'accessPolicy',
        label: 'Política de acceso (JSON: tablas, columnas y scope/via por cliente)',
        secret: false,
        required: true,
      },
    ],
    banners: [
      {
        variant: 'warning',
        text: 'Usuario MySQL con solo SELECT. En AWS RDS usa sslMode "rds". Toda tabla de la política necesita "scope" (filtro por cliente), "via" (filtro a través de otra tabla, p. ej. dispositivos del cliente) o "public": true. Guía: docs/IDENTIDAD-WIDGET-Y-MYSQL.md.',
      },
    ],
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
  mysql: ['mcp:mysql:mysql_list_tables', 'mcp:mysql:mysql_query', 'mcp:mysql:mysql_count'],
  postgres: [
    'pg_list_schemas',
    'pg_list_tables',
    'pg_describe_table',
    'pg_select_readonly',
  ],
};
