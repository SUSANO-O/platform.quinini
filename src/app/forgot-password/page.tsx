'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, CheckCircle, Loader2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error ?? 'Error. Intenta de nuevo.'); return; }
    setSent(true);
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--card)',
    color: 'var(--foreground)', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', padding: '24px' }}>
      <div style={{ maxWidth: 400, width: '100%', padding: '40px 36px', borderRadius: '20px', background: 'var(--card)', border: '1px solid var(--border)' }}>

        {/* Logo */}
        <Link href="/" style={{ display: 'block', marginBottom: '28px', textDecoration: 'none' }}>
          <span style={{ fontSize: '20px', fontWeight: 800, background: 'linear-gradient(135deg,#0d9488,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            AgentFlow
          </span>
        </Link>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle size={48} style={{ color: '#22c55e', margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>Email enviado</h1>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '14px', marginBottom: '24px' }}>
              Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada.
            </p>
            <Link href="/login" style={{
              display: 'inline-block', padding: '10px 24px', borderRadius: '10px',
              background: '#6366f1', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '14px',
            }}>
              ← Volver al login
            </Link>
          </div>
        ) : (
          <>
            <Mail size={32} style={{ color: '#6366f1', marginBottom: '16px' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '6px' }}>Recuperar contraseña</h1>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '24px' }}>
              Ingresa tu email y te enviaremos un enlace para crear una nueva contraseña.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>Email</label>
                <input
                  style={inp} type="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                />
              </div>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', borderRadius: '10px', background: '#6366f1', color: '#fff',
                border: 'none', fontWeight: 700, fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> Enviando...</> : 'Enviar enlace'}
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '20px' }}>
              <Link href="/login" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>← Volver al login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
