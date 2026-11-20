'use client';

/**
 * "Probar como cliente X" de una integración MySQL: el operador indica un dato de identidad
 * (p. ej. cliente = 1234) y ve cuántas filas vería el agente en cada tabla, con el mismo filtro que
 * aplica en el chat. Solo conteos: nunca muestra datos del cliente.
 */

import { useState } from 'react';

type ProbeRow =
  | { table: string; ok: true; total: number; ms: number }
  | { table: string; ok: false; error: string; ms: number };

type ProbeResult = { claims: string[]; tables: ProbeRow[] };

export function MySqlProbe({ connectionId, landingAgentId }: { connectionId: string; landingAgentId: string }) {
  const [claim, setClaim] = useState('cliente');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<ProbeResult | null>(null);

  const run = async () => {
    setLoading(true);
    setErr('');
    setResult(null);
    try {
      const identity = claim.trim() && value.trim() ? { [claim.trim()]: value.trim() } : {};
      const r = await fetch(
        `/api/mcp/connections/${encodeURIComponent(connectionId)}/mysql-probe?landingAgentId=${encodeURIComponent(landingAgentId)}`,
        { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity }) },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j?.error?.message ?? j?.error ?? 'No se pudo ejecutar la prueba.');
        return;
      }
      setResult((j?.data ?? j) as ProbeResult);
    } catch {
      setErr('Error de red al probar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Probar como cliente</div>
      <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '0 0 6px' }}>
        Cuenta cuántas filas vería el agente en cada tabla para ese usuario. Solo números, nunca datos.
      </p>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          placeholder="dato (cliente)"
          aria-label="Dato de identidad"
          style={{ ...input, width: 110, fontFamily: 'monospace' }}
        />
        <span style={{ fontSize: 12 }}>=</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && run()}
          placeholder="valor (p. ej. 1234)"
          aria-label="Valor"
          style={{ ...input, width: 160, fontFamily: 'monospace' }}
        />
        <button type="button" onClick={run} disabled={loading} style={btn}>
          {loading ? 'Probando…' : 'Probar'}
        </button>
      </div>
      {err && <p style={{ color: '#ef4444', fontSize: 12, margin: '6px 0 0' }}>{err}</p>}
      {result && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4 }}>
            Datos de identidad aplicados: {result.claims.length ? result.claims.join(', ') : 'ninguno'}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {result.tables.map((t) => (
                <tr key={t.table}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{t.table}</td>
                  <td style={td}>
                    {t.ok ? (
                      <span>
                        {t.total} fila{t.total === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <span style={{ color: '#b45309' }}>No accesible: {t.error}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const input: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: 12,
};
const btn: React.CSSProperties = {
  background: '#006B7D',
  color: '#fff',
  border: 'none',
  borderRadius: 7,
  padding: '6px 12px',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
};
const td: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
