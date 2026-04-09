'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react';

function ResetPasswordContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }

    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error ?? 'Error. Intenta de nuevo.'); return; }
    setSuccess(true);
    setTimeout(() => router.push('/login'), 3000);
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--card)',
    color: 'var(--foreground)', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', padding: '24px' }}>
      <div style={{ maxWidth: 400, width: '100%', padding: '40px 36px', borderRadius: '20px', background: 'var(--card)', border: '1px solid var(--border)' }}>

        <Link href="/" style={{ display: 'block', marginBottom: '28px', textDecoration: 'none' }}>
          <span style={{ fontSize: '20px', fontWeight: 800, background: 'linear-gradient(135deg,#0d9488,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            AgentFlow
          </span>
        </Link>

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle size={48} style={{ color: '#22c55e', margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>Contraseña actualizada</h1>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '14px' }}>Serás redirigido al login...</p>
          </div>
        ) : (
          <>
            <Lock size={32} style={{ color: '#6366f1', marginBottom: '16px' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '6px' }}>Nueva contraseña</h1>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '24px' }}>
              Crea una contraseña segura de al menos 8 caracteres.
            </p>

            {!token && (
              <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', marginBottom: '16px' }}>
                Enlace inválido.{' '}
                <Link href="/forgot-password" style={{ color: '#ef4444', fontWeight: 700 }}>Solicitar uno nuevo →</Link>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>Nueva contraseña</label>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...inp, paddingRight: '40px' }}
                    type={show ? 'text' : 'password'}
                    required minLength={8}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <button type="button" onClick={() => setShow(!show)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>Confirmar contraseña</label>
                <input
                  style={inp} type="password" required
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                />
              </div>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !token} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', borderRadius: '10px', background: '#6366f1', color: '#fff',
                border: 'none', fontWeight: 700, fontSize: '14px',
                cursor: loading || !token ? 'not-allowed' : 'pointer', opacity: loading || !token ? 0.7 : 1,
              }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> Guardando...</> : 'Guardar contraseña'}
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
