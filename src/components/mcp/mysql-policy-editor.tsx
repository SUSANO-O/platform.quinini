'use client';

/**
 * Editor de la política MySQL por tabla. El operador edita filas (tabla, para qué sirve, columnas,
 * filtro por cliente) y el componente genera el JSON por dentro. Las reglas avanzadas (vía tabla
 * puente, derive…) se conservan y se muestran en solo lectura; el modo "JSON" queda para ellas.
 * Lógica pura y tests en `src/lib/mcp/mysql-policy-editor.ts`.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  addTablesFromSchema,
  emptyRow,
  modelToJson,
  policyToModel,
  validateModel,
  type FilterMode,
  type PolicyModel,
  type PolicyRow,
  type RowError,
  type SchemaTable,
} from '@/lib/mcp/mysql-policy-editor';

type Props = {
  /** JSON inicial de la política. */
  initialJson: string;
  /** Se llama con el JSON resultante y los errores (vacío = se puede guardar). */
  onChange: (json: string, errors: RowError[]) => void;
  /** Lee tablas y columnas reales de la base (opcional). Sin ella no se muestra "Importar". */
  loadSchema?: () => Promise<SchemaTable[]>;
};

export function MySqlPolicyEditor({ initialJson, onChange, loadSchema }: Props) {
  const [schema, setSchema] = useState<SchemaTable[] | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaErr, setSchemaErr] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [model, setModel] = useState<PolicyModel | null>(() => {
    try {
      return policyToModel(initialJson);
    } catch {
      return null;
    }
  });
  const [jsonMode, setJsonMode] = useState(model === null);
  const [jsonText, setJsonText] = useState(initialJson);
  const [jsonError, setJsonError] = useState('');

  const errors = useMemo(() => (model ? validateModel(model) : []), [model]);

  useEffect(() => {
    if (jsonMode) {
      onChange(jsonText, jsonError ? [{ key: '', table: '', message: jsonError }] : []);
    } else if (model) {
      onChange(modelToJson(model), errors);
    }
    // onChange es estable por contrato del padre; no se incluye para no re-disparar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, errors, jsonMode, jsonText, jsonError]);

  const updateRow = (key: string, patch: Partial<PolicyRow>) =>
    setModel((m) => (m ? { ...m, rows: m.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) } : m));
  const removeRow = (key: string) => setModel((m) => (m ? { ...m, rows: m.rows.filter((r) => r.key !== key) } : m));
  const addRow = () => setModel((m) => (m ? { ...m, rows: [...m.rows, emptyRow()] } : m));

  const toJson = () => {
    if (model) setJsonText(modelToJson(model));
    setJsonError('');
    setJsonMode(true);
  };
  const toTables = () => {
    try {
      setModel(policyToModel(jsonText));
      setJsonError('');
      setJsonMode(false);
    } catch (e) {
      setJsonError(e instanceof Error ? `JSON no válido: ${e.message}` : 'JSON no válido');
    }
  };

  const openImport = async () => {
    if (!loadSchema) return;
    setSchemaLoading(true);
    setSchemaErr('');
    try {
      setSchema(await loadSchema());
      setPicked([]);
    } catch (e) {
      setSchemaErr(e instanceof Error ? e.message : 'No se pudo leer la base.');
    } finally {
      setSchemaLoading(false);
    }
  };
  const confirmImport = () => {
    if (schema && model) setModel(addTablesFromSchema(model, schema, picked));
    setSchema(null);
    setPicked([]);
  };
  const existingTables = useMemo(() => new Set(model?.rows.map((r) => r.table.trim()) ?? []), [model]);

  const errorsByRow = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of errors) map.set(e.key, [...(map.get(e.key) ?? []), e.message]);
    return map;
  }, [errors]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
          {jsonMode ? 'Edición avanzada (JSON)' : 'Tablas que el agente puede leer'}
        </span>
        <button type="button" onClick={jsonMode ? toTables : toJson} style={linkBtn}>
          {jsonMode ? 'Volver a editar por tabla' : 'Ver JSON'}
        </button>
      </div>

      {jsonMode ? (
        <>
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setJsonError('');
            }}
            rows={12}
            style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
          />
          {jsonError && <p style={errText}>{jsonError}</p>}
        </>
      ) : model ? (
        <>
          {model.rows.map((r) => {
            const rowErrs = errorsByRow.get(r.key) ?? [];
            return (
              <div key={r.key} style={{ ...rowBox, borderColor: rowErrs.length ? 'rgba(239,68,68,0.6)' : 'var(--border)' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={r.table}
                    onChange={(e) => updateRow(r.key, { table: e.target.value })}
                    placeholder="Nombre de la tabla"
                    style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 600, flex: 1 }}
                  />
                  <button type="button" onClick={() => removeRow(r.key)} title="Quitar tabla" style={removeBtn}>
                    ✕
                  </button>
                </div>
                <textarea
                  value={r.description}
                  onChange={(e) => updateRow(r.key, { description: e.target.value })}
                  placeholder="Para qué sirve y cuándo usarla (el agente lo lee para elegir bien la tabla)"
                  rows={2}
                  style={{ ...inputStyle, marginTop: 6, resize: 'vertical' }}
                />
                <input
                  value={r.columns}
                  onChange={(e) => updateRow(r.key, { columns: e.target.value })}
                  placeholder="Columnas que puede leer, separadas por coma"
                  style={{ ...inputStyle, marginTop: 6, fontFamily: 'monospace', fontSize: 12 }}
                />
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                  <select
                    value={r.mode}
                    onChange={(e) => updateRow(r.key, { mode: e.target.value as FilterMode })}
                    style={{ ...inputStyle, width: 'auto' }}
                  >
                    <option value="scope">Filtrar por cliente</option>
                    <option value="public">Pública (sin filtro)</option>
                    {r.advancedSummary.length > 0 && <option value="advanced">Regla avanzada (sin cambios)</option>}
                  </select>
                  {r.mode === 'scope' && (
                    <>
                      <input
                        value={r.scopeClaim}
                        onChange={(e) => updateRow(r.key, { scopeClaim: e.target.value })}
                        placeholder="dato firmado (cliente)"
                        title="Dato de la identidad firmada del usuario (p. ej. cliente, admin)"
                        style={{ ...inputStyle, width: 130, fontFamily: 'monospace', fontSize: 12 }}
                      />
                      <span style={{ fontSize: 12 }}>→</span>
                      <input
                        value={r.scopeColumn}
                        onChange={(e) => updateRow(r.key, { scopeColumn: e.target.value })}
                        placeholder="columna (k_usuario)"
                        title="Columna de esta tabla que debe coincidir con ese dato"
                        style={{ ...inputStyle, width: 150, fontFamily: 'monospace', fontSize: 12 }}
                      />
                    </>
                  )}
                  {r.mode === 'advanced' && (
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>
                      {r.advancedSummary.join(' · ')} — se edita en “Ver JSON”
                    </span>
                  )}
                </div>
                {rowErrs.map((m) => (
                  <p key={m} style={errText}>{m}</p>
                ))}
              </div>
            );
          })}
          {(errorsByRow.get('') ?? []).map((m) => (
            <p key={m} style={errText}>{m}</p>
          ))}
          <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
            <button type="button" onClick={addRow} style={linkBtn}>
              + Agregar tabla
            </button>
            {loadSchema && (
              <button type="button" onClick={openImport} disabled={schemaLoading} style={linkBtn}>
                {schemaLoading ? 'Leyendo la base…' : '⇣ Importar tablas de la base'}
              </button>
            )}
          </div>
          {schemaErr && <p style={errText}>{schemaErr}</p>}
          {schema && (
            <div style={{ ...rowBox, marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Elige las tablas a exponer ({schema.length} en la base)
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '0 0 6px' }}>
                Se agregan con sus columnas, sin las que parecen sensibles (contraseñas, tokens…). Luego
                define el filtro por cliente de cada una antes de guardar.
              </p>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {schema.map((t) => {
                  const already = existingTables.has(t.table);
                  const sensitive = t.columns.filter((c) => c.sensitive).map((c) => c.name);
                  return (
                    <label key={t.table} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, padding: '3px 0', opacity: already ? 0.5 : 1 }}>
                      <input
                        type="checkbox"
                        disabled={already}
                        checked={already || picked.includes(t.table)}
                        onChange={(e) =>
                          setPicked((p) => (e.target.checked ? [...p, t.table] : p.filter((x) => x !== t.table)))
                        }
                      />
                      <span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{t.table}</span>{' '}
                        <span style={{ color: 'var(--muted-foreground)' }}>
                          · {t.columns.length} columnas{already ? ' · ya está' : ''}
                          {sensitive.length ? ` · excluye: ${sensitive.join(', ')}` : ''}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={confirmImport} disabled={!picked.length} style={linkBtn}>
                  Agregar {picked.length || ''} seleccionada{picked.length === 1 ? '' : 's'}
                </button>
                <button type="button" onClick={() => setSchema(null)} style={{ ...linkBtn, color: 'var(--muted-foreground)' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: 13,
};
const rowBox: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 9, padding: 8, marginBottom: 8 };
const errText: React.CSSProperties = { color: '#ef4444', fontSize: 12, margin: '4px 0 0' };
const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#006B7D',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
  padding: 0,
};
const removeBtn: React.CSSProperties = {
  border: '1px solid var(--border)',
  background: 'transparent',
  borderRadius: 7,
  cursor: 'pointer',
  color: '#ef4444',
  padding: '0 10px',
};
