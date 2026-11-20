'use client';

/**
 * Modal para EDITAR las credenciales de una integración MCP ya existente (sin borrarla y recrearla).
 *
 * Reusa el esquema de campos que la propia conexión ya expone (`credentialFields` + `credentialsMask`),
 * hace PATCH a /api/mcp/connections/[id] y, al guardar, re-sincroniza para validar. Autocontenido:
 * la página solo decide qué conexión está abierta.
 */

import { useState, useCallback } from 'react';

export type EditableMcpConnection = {
  connectionId: string;
  serverName: string;
  integrationKey: string;
  credentialFields: { key: string; label: string; secret: boolean; required: boolean }[];
  credentialsMask?: Record<string, string>;
};

type Props = {
  connection: EditableMcpConnection;
  landingAgentId: string;
  onClose: () => void;
  /** Llamado tras guardar+resync OK (p. ej. recargar la lista de integraciones). */
  onSaved: () => void;
};

export function McpConnectionEditModal({ connection, landingAgentId, onClose, onSaved }: Props) {
  // Todos los campos arrancan VACÍOS: la API solo devuelve valores enmascarados ("136.…03", "{   … }")
  // y pre-llenarlos haría que al guardar se sobrescriba la config real con esa máscara.
  // Vacío = "dejar como está"; solo se envía lo que el usuario escribe.
  const [creds, setCreds] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of connection.credentialFields) init[f.key] = '';
    // accessPolicy no es secreta y el hub la devuelve completa: se precarga formateada para editar
    // descripciones sin reescribirla. Solo si es JSON válido (nunca una máscara tipo "{   … }").
    const ap = connection.credentialsMask?.accessPolicy;
    if (ap && 'accessPolicy' in init) {
      try {
        init.accessPolicy = JSON.stringify(JSON.parse(ap), null, 2);
      } catch {
        /* enmascarada o inválida: se deja vacía (= no cambia) */
      }
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = useCallback(async () => {
    const changed = connection.credentialFields.some((f) => String(creds[f.key] ?? '').trim());
    if (!changed) {
      setErr('Escribe al menos un campo para actualizar (los vacíos se dejan como están).');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const credentials: Record<string, string> = {};
      for (const f of connection.credentialFields) {
        const v = String(creds[f.key] ?? '').trim();
        if (v) credentials[f.key] = v;
      }
      const r = await fetch(
        `/api/mcp/connections/${encodeURIComponent(connection.connectionId)}?landingAgentId=${encodeURIComponent(landingAgentId)}`,
        { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credentials }) },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j?.error ?? 'No se pudo guardar la integración.');
        setSaving(false);
        return;
      }
      // Re-sincroniza para validar las credenciales nuevas (misma ruta que "Reintentar").
      await fetch(
        `/api/mcp/connections/${encodeURIComponent(connection.connectionId)}/sync?landingAgentId=${encodeURIComponent(landingAgentId)}`,
        { method: 'POST', credentials: 'include' },
      ).catch(() => {});
      onSaved();
      onClose();
    } catch {
      setErr('Error de red al guardar.');
      setSaving(false);
    }
  }, [connection, creds, landingAgentId, onSaved, onClose]);

  return (
    <div style={overlay} onClick={() => !saving && onClose()}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Editar integración</h2>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '4px 0 16px' }}>
          {connection.serverName} — corrige las credenciales y guarda; se reintenta la conexión automáticamente.
        </p>

        {connection.credentialFields.map((f) => (
          <label key={f.key} style={{ display: 'block', marginBottom: 12 }}>
            <span style={lbl}>
              {f.label}
            </span>
            {f.key === 'accessPolicy' ? (
              <textarea
                value={creds[f.key] ?? ''}
                onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder="Vacío = deja la política actual. Pega el JSON completo para reemplazarla."
                rows={5}
                style={{ ...input, fontFamily: 'monospace', resize: 'vertical' }}
              />
            ) : (
              <input
                type={f.secret ? 'password' : 'text'}
                value={creds[f.key] ?? ''}
                onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder={
                  f.secret
                    ? '•••••••• (vacío = no cambia)'
                    : `${connection.credentialsMask?.[f.key] || ''} (vacío = no cambia)`.trim()
                }
                autoComplete="off"
                style={input}
              />
            )}
          </label>
        ))}
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '0 0 4px' }}>
          Solo se actualizan los campos que escribas; el resto queda igual.
        </p>

        {err && <p style={{ color: '#ef4444', fontSize: 13, margin: '4px 0 0' }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" onClick={onClose} disabled={saving} style={btnGhost}>Cancelar</button>
          <button type="button" onClick={save} disabled={saving} style={btnPrimary}>
            {saving ? 'Guardando…' : 'Guardar y reintentar'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 16 };
const modal: React.CSSProperties = { background: 'var(--background, #fff)', color: 'var(--foreground)', borderRadius: 14, padding: 22, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', border: '1px solid var(--border)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: '#006B7D', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13 };
