# MCP interno: MongoDB y PostgreSQL (cliente)

La **agent-flow-landing** ya incluye:

- Catálogo fusionado (`mergeInternalDataSourceMcpCatalog`) si el hub no envía las claves `mongodb` y `postgres`.
- `POST /api/mcp/data-sources/test` — ping efímero desde la landing (solo valida URI; **no** sustituye al hub para tools).

La **ejecución de herramientas** (`mongo_*`, `pg_*`) y la persistencia segura deben vivir en **AIBackHub**, alineado con la política MCP Fase 3 (módulos internos, no `mcp_standard`).

## Contrato de credenciales (objeto `credentials` en `mcp_connections`)

| Campo | Obligatorio | Descripción |
|--------|-------------|--------------|
| `connectionUri` | Sí | URI completa (Mongo o Postgres). Cifrado en reposo en el hub. |
| `accessMode` | No | `read_only` (defecto) o `read_write`. |
| `maxRows` | No | Entero; defecto sugerido `500`. |
| `allowedDatabases` | No | Solo Mongo: lista separada por comas. Vacío = todas (el hub puede denegar por defecto seguro). |
| `allowedSchemas` | No | Solo Postgres: lista separada por comas. |

## Tool IDs sugeridos (sync / agente)

Definidos en código landing: `DATA_SOURCE_MCP_TOOL_IDS` en `src/lib/mcp-internal-data-sources-catalog.ts`.

**Mongo:** `mongo_list_database_names`, `mongo_list_collections`, `mongo_collection_indexes`, `mongo_find`, `mongo_aggregate_readonly`.

**Postgres:** `pg_list_schemas`, `pg_list_tables`, `pg_describe_table`, `pg_select_readonly`.

En `POST .../sync`, si el hub no descubre tools remotas, puede devolver esta lista estática como `toolsSnapshot`.

## Implementación recomendada en AIBackHub

1. **Catálogo** (`MCP_INTEGRATION_CATALOG` o equivalente): añadir entradas con las mismas claves y `credentialFields` que `INTERNAL_DATA_SOURCE_MCP_CATALOG_ENTRIES` (o confiar en la fusión solo desde landing; si el hub también las envía, **predomina el hub**).
2. **Validación al guardar** `POST /api/mcp/connections`: comprobar prefijo de URI y `accessMode` permitido.
3. **Pool por `connectionId`**: cliente Mongo/PG reutilizable con TTL; cerrar al borrar conexión.
4. **Ejecutores**:
   - `mongo_find`: `limit` forzado ≤ `maxRows`; filtros sin `$where` ni JS; sin operadores de escritura si `read_only`.
   - `pg_select_readonly`: solo `SELECT` validado (parser AST o plantilla parametrizada); timeout de sentencia.
5. **Auditoría**: `agentId`, `connectionId`, tool, hash de argumentos, filas devueltas (sin volcar PII en logs).

## Seguridad

- Exigir usuario de BD con **mínimo privilegio** en documentación al cliente.
- Opcional: allowlist de IPs de salida del hub para firewalls del cliente.
- No registrar URIs con contraseña en texto claro.
