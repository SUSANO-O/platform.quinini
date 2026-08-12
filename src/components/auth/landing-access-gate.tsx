'use client';

import { useState } from 'react';
import { Lock } from '@/components/ui/icons';

type Props = {
  onVerified: () => void | Promise<void>;
  /** login = usa tempToken; session = sesión ya activa */
  mode: 'login' | 'session';
  tempToken?: string;
};

export function LandingAccessGate({ onVerified, mode, tempToken }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = mode === 'login'
        ? '/api/auth/landing-access/complete'
        : '/api/auth/landing-access/verify';
      const body = mode === 'login'
        ? { tempToken, code }
        : { code };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json() as { error?: string; user?: unknown };
      if (!res.ok) {
        setError(data.error || 'Código incorrecto.');
        setCode('');
        return;
      }
      await onVerified();
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(2,6,23,0.72)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        className="card-texture"
        style={{
          width: 'min(420px, 100%)',
          borderRadius: 18,
          border: '1px solid var(--border)',
          background: 'var(--card)',
          padding: '28px 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(var(--brand-primary-rgb),0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={20} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Código de acceso</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
              Tu cuenta tiene restricción de acceso. Ingresa el código que te proporcionó el administrador.
            </p>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Ej. A3K9M2"
            autoComplete="off"
            autoFocus
            className="landing-input"
            style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.12em', textAlign: 'center' }}
          />
          {error && (
            <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="landing-btn-primary"
            style={{ opacity: loading || !code.trim() ? 0.6 : 1 }}
          >
            {loading ? 'Verificando…' : 'Continuar'}
          </button>
        </form>
      </div>
    </div>
  );
}
