/**
 * Lógica pura del editor de política MySQL por tabla (sin React).
 *
 * El operador edita filas (tabla, descripción, columnas, filtro) en lugar de un JSON crudo. Lo que el
 * editor no sabe editar se CONSERVA tal cual: reglas `via` (tabla puente), `where` de tabla, `derive`
 * a nivel raíz y cualquier campo desconocido. Así nunca se pierde configuración avanzada al guardar.
 *
 * La validación replica las reglas del hub (`matias-backend/src/ai/mcp/mysql/policy.ts`) y añade la
 * que causó el incidente de Tribu (2026-11-20): un "dato de identidad" con nombre de campo de la
 * política (p. ej. "column") hace fallar todas las consultas de esa tabla.
 */

export type FilterMode = 'public' | 'scope' | 'advanced';

export type PolicyRow = {
  /** Clave estable para React (no se guarda). */
  key: string;
  table: string;
  description: string;
  /** Columnas separadas por coma, tal como las escribe el operador. */
  columns: string;
  mode: FilterMode;
  /** Solo en mode 'scope': dato de identidad firmado (p. ej. "cliente"). */
  scopeClaim: string;
  /** Solo en mode 'scope': columna de la tabla que debe coincidir (p. ej. "k_usuario"). */
  scopeColumn: string;
  /** Resumen legible de las reglas avanzadas (solo lectura). */
  advancedSummary: string[];
  /** Definición original de la tabla: lo no editable se conserva desde aquí. */
  raw: Record<string, unknown>;
};

export type PolicyModel = {
  rows: PolicyRow[];
  /** Todo lo de la raíz que no es `tables` (p. ej. `derive`). */
  rootExtras: Record<string, unknown>;
};

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const CLAIM_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const POLICY_KEYWORDS = new Set([
  'column', 'from', 'select', 'scope', 'where', 'via', 'collate', 'columns', 'table', 'public', 'description',
]);

let keySeq = 0;
const nextKey = () => `row-${++keySeq}`;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isSafeTableName(name: string): boolean {
  const parts = name.split('.');
  return parts.length <= 2 && parts.every((p) => IDENT_RE.test(p));
}

function summarizeAdvanced(def: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (isObj(def.scope)) {
    for (const [claim, col] of Object.entries(def.scope)) out.push(`${claim} → ${String(col)}`);
  }
  const vias = Array.isArray(def.via) ? def.via : def.via !== undefined ? [def.via] : [];
  for (const v of vias) {
    if (!isObj(v)) continue;
    const scope = isObj(v.scope) ? v.scope : {};
    for (const [claim, col] of Object.entries(scope)) out.push(`${claim} vía ${String(v.from)}.${String(col)}`);
  }
  return out;
}

/** Fila vacía para "Agregar tabla". */
export function emptyRow(): PolicyRow {
  return {
    key: nextKey(),
    table: '',
    description: '',
    columns: '',
    mode: 'scope',
    scopeClaim: 'cliente',
    scopeColumn: '',
    advancedSummary: [],
    raw: {},
  };
}

/** JSON de la política → filas editables. Lanza si no es un JSON con `tables`. */
export function policyToModel(json: string): PolicyModel {
  const parsed: unknown = JSON.parse(json);
  if (!isObj(parsed) || !isObj(parsed.tables)) {
    throw new Error('La política debe ser un objeto con "tables".');
  }
  const { tables, ...rootExtras } = parsed;
  const rows: PolicyRow[] = Object.entries(tables as Record<string, unknown>).map(([table, defRaw]) => {
    const def = isObj(defRaw) ? defRaw : {};
    const scope = isObj(def.scope) ? def.scope : undefined;
    const hasVia = def.via !== undefined;
    const scopeEntries = scope ? Object.entries(scope) : [];
    let mode: FilterMode;
    if (def.public === true && !scope && !hasVia) mode = 'public';
    else if (!hasVia && scopeEntries.length === 1) mode = 'scope';
    else mode = 'advanced';
    const [claim, col] = mode === 'scope' ? scopeEntries[0] : ['cliente', ''];
    return {
      key: nextKey(),
      table,
      description: typeof def.description === 'string' ? def.description : '',
      columns: Array.isArray(def.columns) ? def.columns.map(String).join(', ') : '',
      mode,
      scopeClaim: String(claim),
      scopeColumn: String(col ?? ''),
      advancedSummary: mode === 'advanced' ? summarizeAdvanced(def) : [],
      raw: def,
    };
  });
  return { rows, rootExtras };
}

export function parseColumns(text: string): string[] {
  return text.split(',').map((c) => c.trim()).filter(Boolean);
}

/** Filas → objeto de política (conserva lo no editable desde `raw` y `rootExtras`). */
export function modelToPolicy(model: PolicyModel): Record<string, unknown> {
  const tables: Record<string, unknown> = {};
  for (const r of model.rows) {
    const def: Record<string, unknown> = { ...r.raw };
    const desc = r.description.trim();
    if (desc) def.description = desc;
    else delete def.description;
    def.columns = parseColumns(r.columns);
    if (r.mode === 'public') {
      def.public = true;
      delete def.scope;
      delete def.via;
    } else if (r.mode === 'scope') {
      def.scope = { [r.scopeClaim.trim()]: r.scopeColumn.trim() };
      delete def.public;
      delete def.via;
    }
    // 'advanced': scope/via/public quedan exactamente como venían en raw.
    tables[r.table.trim()] = def;
  }
  return { ...model.rootExtras, tables };
}

export function modelToJson(model: PolicyModel): string {
  return JSON.stringify(modelToPolicy(model), null, 2);
}

export type RowError = { key: string; table: string; message: string };

/** Errores que impedirían guardar o que harían fallar las consultas. Vacío = OK. */
export function validateModel(model: PolicyModel): RowError[] {
  const errors: RowError[] = [];
  const seen = new Set<string>();
  if (model.rows.length === 0) {
    errors.push({ key: '', table: '', message: 'La política necesita al menos una tabla.' });
  }
  for (const r of model.rows) {
    const t = r.table.trim();
    const push = (message: string) => errors.push({ key: r.key, table: t || '(sin nombre)', message });
    if (!t) push('Falta el nombre de la tabla.');
    else if (!isSafeTableName(t)) push(`Nombre de tabla no válido: "${t}" (solo letras, números y _).`);
    else if (seen.has(t)) push(`La tabla "${t}" está repetida.`);
    if (t) seen.add(t);

    const cols = parseColumns(r.columns);
    if (cols.length === 0) push('Indica al menos una columna que el agente pueda leer.');
    for (const c of cols) if (!IDENT_RE.test(c)) push(`Columna no válida: "${c}".`);

    if (r.mode === 'scope') {
      const claim = r.scopeClaim.trim();
      const col = r.scopeColumn.trim();
      if (!claim || !CLAIM_RE.test(claim)) push(`Dato de identidad no válido: "${claim}".`);
      else if (POLICY_KEYWORDS.has(claim.toLowerCase())) {
        push(`"${claim}" es un campo de la política, no un dato del usuario: las consultas fallarían.`);
      }
      if (!col || !IDENT_RE.test(col)) push(`Columna de filtro no válida: "${col}".`);
    }
    if (r.mode === 'advanced') {
      for (const s of r.advancedSummary) {
        const claim = s.split(' ')[0];
        if (POLICY_KEYWORDS.has(claim.toLowerCase())) {
          push(`La regla avanzada pide el dato "${claim}", que es un campo de la política: revisa el JSON.`);
        }
      }
      if (r.advancedSummary.length === 0 && r.raw.public !== true) {
        push('No tiene filtro por cliente ni está marcada como pública.');
      }
    }
  }
  return errors;
}

/** Tabla del esquema real de la base (de `information_schema`, vía el hub). */
export type SchemaTable = { table: string; columns: { name: string; type: string; sensitive: boolean }[] };

/**
 * Agrega al modelo las tablas elegidas del esquema. No duplica tablas existentes. Columnas: las que
 * indique `columnsByTable` o, por defecto, todas menos las sensibles. El filtro queda en "scope" con
 * la columna vacía: la validación obliga al operador a elegirla (o a marcarla pública) antes de guardar.
 */
export function addTablesFromSchema(
  model: PolicyModel,
  schema: SchemaTable[],
  selected: string[],
  columnsByTable: Record<string, string[]> = {},
): PolicyModel {
  const existing = new Set(model.rows.map((r) => r.table.trim()));
  const added: PolicyRow[] = [];
  for (const name of selected) {
    if (existing.has(name)) continue;
    const t = schema.find((x) => x.table === name);
    if (!t) continue;
    const cols = columnsByTable[name] ?? t.columns.filter((c) => !c.sensitive).map((c) => c.name);
    added.push({ ...emptyRow(), table: name, columns: cols.join(', ') });
    existing.add(name);
  }
  return { ...model, rows: [...model.rows, ...added] };
}
