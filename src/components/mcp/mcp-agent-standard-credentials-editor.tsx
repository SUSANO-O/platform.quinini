'use client';

import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, KeyRound, Loader2, RefreshCw } from 'lucide-react';

export type McpCredField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
};

const SERVER_FIELD_KEYS = new Set(['MCP_SERVER_URL', 'MCP_AUTH_HEADER']);

const inp: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  fontSize: '12px',
  boxSizing: 'border-box',
};

const pillBase: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: 20,
  whiteSpace: 'nowrap',
};

function fieldPlaceholder(f: McpCredField, hasStored: boolean): string {
  if (f.secret) {
    return hasStored ? 'Vacío = conservar el valor en el hub' : 'Pegar valor';
  }
  if (f.key === 'MCP_SERVER_URL') {
    return hasStored ? 'Solo si cambias la URL: pega http:// o https://…' : 'https://…';
  }
  return hasStored ? 'Solo si cambias este campo' : 'Opcional';
}

type GooglePart = {
  status: string;
  error?: string;
  emailAddress?: string;
};

/**
 * Edición de credenciales guardadas en el hub para `mcp_standard` (URL, Auth, Gmail/Calendar opcional).
 * PATCH parcial: campos vacíos no sobrescriben secretos ya guardados.
 */
export function McpAgentStandardCredentialsEditor({
  landingAgentId,
  connectionId,
  credentialFields,
  credentialsMask,
  readOnly,
  onResync,
}: {
  landingAgentId: string;
  connectionId: string;
  credentialFields: McpCredField[];
  credentialsMask: Record<string, string>;
  readOnly: boolean;
  onResync: (connectionId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [localErr, setLocalErr] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [googleVerify, setGoogleVerify] = useState<{
    loading: boolean;
    ran: boolean;
    gmail?: GooglePart;
    calendar?: GooglePart;
  }>({ loading: false, ran: false });

  const setField = useCallback((key: string, v: string) => {
    setValues((p) => ({ ...p, [key]: v }));
  }, []);

  const { serverFields, googleFields } = useMemo(() => {
    const server = credentialFields.filter((f) => SERVER_FIELD_KEYS.has(f.key));
    const google = credentialFields.filter((f) => !SERVER_FIELD_KEYS.has(f.key));
    return { serverFields: server, googleFields: google };
  }, [credentialFields]);

  const storedSummary = useMemo(() => {
    const keys = credentialFields
      .map((f) => f.key)
      .filter((k) => Boolean(credentialsMask[k]?.trim()));
    return { count: keys.length, keys };
  }, [credentialFields, credentialsMask]);

  const verifyGoogle = useCallback(async () => {
    setLocalErr('');
    setGoogleVerify((p) => ({ ...p, loading: true }));
    try {
      const r = await fetch(
        `/api/mcp/connections/${encodeURIComponent(connectionId)}/verify-google?landingAgentId=${encodeURIComponent(landingAgentId)}`,
        { method: 'POST', credentials: 'include' },
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err =
          typeof data?.error === 'string'
            ? data.error
            : typeof data?.error?.message === 'string'
              ? data.error.message
              : 'No se pudo comprobar con Google.';
        setLocalErr(err);
        setGoogleVerify({ loading: false, ran: true });
        return;
      }
      const inner = (data?.data ?? data) as {
        gmail?: GooglePart;
        calendar?: GooglePart;
      };
      setGoogleVerify({
        loading: false,
        ran: true,
        gmail: inner?.gmail,
        calendar: inner?.calendar,
      });
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
      setGoogleVerify({ loading: false, ran: true });
    }
  }, [connectionId, landingAgentId]);

  const save = async () => {
    setLocalErr('');
    setMsg('');
    const creds: Record<string, string> = {};
    for (const f of credentialFields) {
      const raw = (values[f.key] ?? '').trim();
      if (!raw) continue;
      creds[f.key] = raw;
    }
    if (Object.keys(creds).length === 0) {
      setLocalErr(
        'Indica al menos un campo con valor nuevo. Los secretos ya guardados no se borran si dejas el campo vacío.',
      );
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(
        `/api/mcp/connections/${encodeURIComponent(connectionId)}?landingAgentId=${encodeURIComponent(landingAgentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ credentials: creds }),
        },
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setLocalErr(
          typeof data?.error === 'string' ? data.error : 'No se pudieron guardar las credenciales.',
        );
        return;
      }
      setValues({});
      setGoogleVerify({ loading: false, ran: false });
      setMsg('Guardado en AIBackHub. Re-sincronizando con el servidor MCP…');
      await onResync(connectionId);
      setMsg('Listo: credenciales persistidas y conexión MCP actualizada.');
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (readOnly || credentialFields.length === 0) return null;

  const cid = connectionId.replace(/[^a-z0-9-]/gi, '').slice(0, 12) || 'conn';

  const renderGooglePills = () => {
    if (googleVerify.loading) {
      return (
        <span style={{ ...pillBase, background: 'rgba(217,119,6,0.15)', color: '#d97706' }}>
          Comprobando…
        </span>
      );
    }
    if (!googleVerify.ran) {
      return (
        <span style={{ ...pillBase, background: 'var(--muted-foreground)', color: 'var(--background)', opacity: 0.85 }}>
          Sin comprobar
        </span>
      );
    }
    const pills: ReactNode[] = [];
    const g = googleVerify.gmail;
    const c = googleVerify.calendar;
    if (g?.status === 'skipped' && c?.status === 'skipped') {
      pills.push(
        <span
          key="both-skip"
          style={{ ...pillBase, background: 'rgba(100,116,139,0.12)', color: 'var(--muted-foreground)' }}
        >
          Google opcional sin datos en hub
        </span>,
      );
    } else {
      if (g) {
        if (g.status === 'ok') {
          const extra = g.emailAddress ? ` · ${g.emailAddress}` : '';
          pills.push(
            <span
              key="g-ok"
              style={{ ...pillBase, background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}
              title="Gmail API respondió correctamente"
            >
              Gmail OK{extra}
            </span>,
          );
        } else if (g.status === 'error') {
          pills.push(
            <span
              key="g-err"
              style={{ ...pillBase, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
              title={g.error ?? ''}
            >
              Gmail error
            </span>,
          );
        } else {
          pills.push(
            <span
              key="g-skip"
              style={{ ...pillBase, background: 'rgba(100,116,139,0.1)', color: 'var(--muted-foreground)' }}
            >
              Gmail no configurado
            </span>,
          );
        }
      }
      if (c) {
        if (c.status === 'ok') {
          pills.push(
            <span
              key="c-ok"
              style={{ ...pillBase, background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}
              title="Calendar API (primary) respondió correctamente"
            >
              Calendar OK
            </span>,
          );
        } else if (c.status === 'error') {
          pills.push(
            <span
              key="c-err"
              style={{ ...pillBase, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
              title={c.error ?? ''}
            >
              Calendar error
            </span>,
          );
        } else {
          pills.push(
            <span
              key="c-skip"
              style={{ ...pillBase, background: 'rgba(100,116,139,0.1)', color: 'var(--muted-foreground)' }}
            >
              Calendar no configurado
            </span>,
          );
        }
      }
    }
    return <>{pills}</>;
  };

  const renderField = (f: McpCredField) => {
    const masked = credentialsMask[f.key]?.trim();
    const hasStored = Boolean(masked);
    return (
      <div key={f.key}>
        <label
          style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            marginBottom: 6,
            color: 'var(--muted-foreground)',
          }}
        >
          {f.label}
          {f.required ? ' *' : ''}
        </label>
        {hasStored ? (
          <p
            style={{
              fontSize: '10px',
              color: 'var(--muted-foreground)',
              margin: '0 0 6px',
              lineHeight: 1.4,
            }}
          >
            En hub (enmascarado):{' '}
            <code
              style={{
                fontSize: '10px',
                background: 'var(--background)',
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                wordBreak: 'break-all',
              }}
            >
              {masked}
            </code>
          </p>
        ) : (
          <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: '0 0 6px' }}>
            Sin valor guardado en hub para este campo.
          </p>
        )}
        <input
          style={inp}
          type={f.secret ? 'password' : 'text'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          name={`mcp-${cid}-${f.key}`}
          id={`mcp-${cid}-${f.key}`}
          inputMode={f.key === 'MCP_SERVER_URL' ? 'url' : 'text'}
          value={values[f.key] ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
          placeholder={fieldPlaceholder(f, hasStored)}
        />
      </div>
    );
  };

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        padding: '12px 14px',
        background: 'rgba(0,0,0,0.02)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          border: 'none',
          background: 'transparent',
          padding: 0,
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--foreground)',
        }}
      >
        <KeyRound size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Credenciales por agente (cuenta Gmail / Calendar en el MCP)</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      <p
        style={{
          fontSize: '11px',
          color: 'var(--muted-foreground)',
          margin: '8px 0 0',
          lineHeight: 1.5,
        }}
      >
        Persisten en <strong>AIBackHub</strong> (Mongo). El hub las reenvía al servidor MCP en cada llamada. Vista
        enmascarada de lo guardado; los inputs vacíos hasta que cambies algo.
      </p>
      <p
        style={{
          fontSize: '11px',
          color: '#16a34a',
          margin: '6px 0 0',
          lineHeight: 1.45,
          fontWeight: 600,
        }}
      >
        {storedSummary.count > 0
          ? `Credenciales guardadas en hub: ${storedSummary.count} campo${storedSummary.count !== 1 ? 's' : ''} con valor.`
          : 'Aún no hay valores opcionales en hub; URL y auth deberían estar en la conexión.'}
      </p>
      {open && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {serverFields.map(renderField)}

          {googleFields.length > 0 ? (
            <>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 0 4px',
                  borderTop: '1px dashed var(--border)',
                  marginTop: 4,
                }}
              >
                <label
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--foreground)',
                    margin: 0,
                    flex: '1 1 160px',
                  }}
                >
                  Gmail / Google (opcional, reenvío al MCP)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  {renderGooglePills()}
                  <button
                    type="button"
                    disabled={googleVerify.loading || readOnly}
                    title="Comprueba contra Gmail (perfil) y Google Calendar (calendario primary) usando lo guardado en el hub"
                    onClick={() => void verifyGoogle()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'rgba(99,102,241,0.1)',
                      color: '#6366f1',
                      cursor: googleVerify.loading || readOnly ? 'not-allowed' : 'pointer',
                      opacity: readOnly ? 0.6 : 1,
                    }}
                  >
                    {googleVerify.loading ? (
                      <Loader2 size={12} style={{ animation: 'spin 0.7s linear infinite' }} />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Comprobar con Google
                  </button>
                </div>
              </div>
              <p
                style={{
                  fontSize: '10px',
                  color: 'var(--muted-foreground)',
                  margin: 0,
                  lineHeight: 1.45,
                }}
              >
                No sustituye al <strong>Sync</strong> de la tarjeta MCP (hub ↔ servidor MCP). Solo valida tokens OAuth
                frente a Google. Si acabas de pegar credenciales, primero <strong>Guardar y re-sincronizar</strong> y
                luego comprueba aquí.
              </p>
              {googleFields.map(renderField)}
            </>
          ) : null}

          {localErr ? (
            <p style={{ fontSize: '12px', color: '#ef4444', margin: 0, lineHeight: 1.45 }}>{localErr}</p>
          ) : null}
          {msg ? (
            <p style={{ fontSize: '12px', color: '#16a34a', margin: 0, lineHeight: 1.45 }}>{msg}</p>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            style={{
              alignSelf: 'flex-start',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '12px',
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.75 : 1,
            }}
          >
            {saving ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : null}
            Guardar y re-sincronizar
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}
