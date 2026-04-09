'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';

function VerifyEmailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');

  const [state, setState] = useState<'loading' | 'success' | 'error' | 'notoken'>('loading');
  const [resendEmail, setResendEmail] = useState('');
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) { setState('notoken'); return; }

    fetch(`/api/auth/verify-email?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        setState(d.ok ? 'success' : 'error');
        if (d.ok) setTimeout(() => router.push('/dashboard'), 3000);
      })
      .catch(() => setState('error'));
  }, [token, router]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResending(true);
    await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resendEmail }),
    });
    setResendSent(true);
    setResending(false);
  }

  const card: React.CSSProperties = {
    maxWidth: 420, margin: '0 auto', padding: '40px 36px', borderRadius: '20px',
    background: 'var(--card)', border: '1px solid var(--border)', textAlign: 'center',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', padding: '24px' }}>
      <div style={card}>
        {state === 'loading' && (
          <>
            <Loader2 size={40} style={{ color: '#6366f1', margin: '0 auto 16px', animation: 'spin 0.7s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>Verificando...</h1>
          </>
        )}

        {state === 'success' && (
          <>
            <CheckCircle size={48} style={{ color: '#22c55e', margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Email verificado</h1>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '14px', marginBottom: '20px' }}>
              ¡Tu cuenta está lista! Serás redirigido al dashboard en unos segundos.
            </p>
            <Link href="/dashboard" style={{
              display: 'inline-block', padding: '10px 24px', borderRadius: '10px',
              background: '#6366f1', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '14px',
            }}>
              Ir al dashboard →
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle size={48} style={{ color: '#ef4444', margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Enlace inválido</h1>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '14px', marginBottom: '20px' }}>
              El enlace expiró o no es válido. Solicita uno nuevo.
            </p>
            {!resendSent ? (
              <form onSubmit={handleResend} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="email" required value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="Tu email"
                  style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '14px', outline: 'none' }}
                />
                <button type="submit" disabled={resending} style={{
                  padding: '10px', borderRadius: '10px', background: '#6366f1', color: '#fff',
                  border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                }}>
                  {resending ? 'Enviando...' : 'Reenviar verificación'}
                </button>
              </form>
            ) : (
              <p style={{ color: '#22c55e', fontSize: '14px' }}>✓ Email enviado. Revisa tu bandeja.</p>
            )}
          </>
        )}

        {state === 'notoken' && (
          <>
            <Mail size={48} style={{ color: '#6366f1', margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Verifica tu email</h1>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '14px', marginBottom: '20px' }}>
              Hemos enviado un enlace de verificación a tu email. Revisa tu bandeja de entrada.
            </p>
            <Link href="/dashboard" style={{
              display: 'inline-block', padding: '10px 24px', borderRadius: '10px',
              border: '1px solid var(--border)', color: 'var(--foreground)', textDecoration: 'none', fontWeight: 600, fontSize: '14px',
            }}>
              ← Volver
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
