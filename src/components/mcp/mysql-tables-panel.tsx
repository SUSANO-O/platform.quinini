'use client';

/**
 * Vista de solo lectura de lo que el agente puede leer de una integración MySQL: tablas, para qué
 * sirve cada una, columnas y cómo se filtra por cliente. Es lo mismo que el agente ve en su prompt.
 * Avisa si alguna regla pide un dato de identidad que es en realidad un campo de la política
 * (p. ej. "column"): señal de un `via` mal anidado que hace fallar todas las consultas de esa tabla.
 */

export type MySqlTableForUi = {
  table: string;
  description: string;
  columns: string[];
  public: boolean;
  filters: string[];
};

export type MySqlCatalogForUi =
  | { ok: true; tables: MySqlTableForUi[]; suspiciousClaims: string[] }
  | { ok: false; error: string };

export function MySqlTablesPanel({ catalog }: { catalog?: MySqlCatalogForUi | null }) {
  if (!catalog) {
    return (
      <p style={muted}>
        Esta integración no tiene política de acceso: el agente no puede leer ninguna tabla.
      </p>
    );
  }
  if (!catalog.ok) {
    return (
      <div style={alertBox}>
        <strong>La política de acceso no es válida.</strong> El agente no puede consultar nada.
        <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}>{catalog.error}</div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      {catalog.suspiciousClaims.length > 0 && (
        <div style={alertBox}>
          <strong>Regla sospechosa:</strong> el filtro pide el dato{' '}
          {catalog.suspiciousClaims.map((c) => `"${c}"`).join(', ')} de la identidad del cliente, pero
          ese nombre es un campo de la política, no un dato del usuario. Las consultas a esa tabla van
          a fallar. Revisa la política (probablemente un <code>via</code> mal anidado).
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 600, margin: '4px 0 6px' }}>
        Tablas que el agente puede leer ({catalog.tables.length})
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Tabla</th>
              <th style={th}>Para qué sirve</th>
              <th style={th}>Columnas</th>
              <th style={th}>Filtro por cliente</th>
            </tr>
          </thead>
          <tbody>
            {catalog.tables.map((t) => {
              const bad = t.filters.some((f) => catalog.suspiciousClaims.some((c) => f.startsWith(`${c} `)));
              return (
                <tr key={t.table} style={bad ? { background: 'rgba(239,68,68,0.08)' } : undefined}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{t.table}</td>
                  <td style={td}>{t.description || <span style={muted}>Sin descripción</span>}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{t.columns.join(', ')}</td>
                  <td style={td}>
                    {t.public ? (
                      <span style={muted}>Pública (sin filtro)</span>
                    ) : (
                      t.filters.map((f) => (
                        <div key={f} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                          {f}
                        </div>
                      ))
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const muted: React.CSSProperties = { fontSize: 12, color: 'var(--muted-foreground)' };
const alertBox: React.CSSProperties = {
  border: '1px solid rgba(239,68,68,0.5)',
  background: 'rgba(239,68,68,0.08)',
  color: 'var(--foreground)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 12,
  margin: '8px 0',
};
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
