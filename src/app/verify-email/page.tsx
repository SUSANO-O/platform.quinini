'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
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
    if (!token) {
      setState('notoken');
      return;
    }

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

  return (
    <div className="landing-auth-wrap">
      <div className="hero-glow" style={{ background: 'var(--accent)', top: '-160px', left: '20%' }} />
      <div className="hero-glow" style={{ background: 'var(--gradient-start)', bottom: '-140px', right: '10%' }} />

      <div className="relative w-full max-w-[420px] landing-card p-10 text-center">
        <Link href="/" className="inline-flex items-center justify-center gap-2 mb-8 no-underline">
          <Image src="/t.jpg" alt="MatIAs" width={36} height={36} className="rounded-xl object-cover" style={{ aspectRatio: '1/1' }} />
          <span className="text-lg font-bold gradient-text">MatIAs</span>
        </Link>

        {state === 'loading' && (
          <>
            <Loader2 size={40} className="mx-auto mb-4 animate-spin" style={{ color: 'var(--primary)' }} />
            <h1 className="text-xl font-bold mb-2">Verificando...</h1>
          </>
        )}

        {state === 'success' && (
          <>
            <CheckCircle size={48} className="mx-auto mb-4 text-green-600" />
            <h1 className="text-[22px] font-bold mb-2">Email verificado</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
              ¡Tu cuenta está lista! Serás redirigido al dashboard en unos segundos.
            </p>
            <Link href="/dashboard" className="landing-btn-primary no-underline !w-auto inline-flex px-6">
              Ir al dashboard →
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle size={48} className="mx-auto mb-4 text-red-500" />
            <h1 className="text-[22px] font-bold mb-2">Enlace inválido</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
              El enlace expiró o no es válido. Solicita uno nuevo.
            </p>
            {!resendSent ? (
              <form onSubmit={handleResend} className="flex flex-col gap-2.5 text-left">
                <input
                  type="email"
                  required
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="Tu email"
                  className="landing-input"
                />
                <button type="submit" disabled={resending} className="landing-btn-primary">
                  {resending ? 'Enviando...' : 'Reenviar verificación'}
                </button>
              </form>
            ) : (
              <p className="text-green-600 text-sm m-0">✓ Email enviado. Revisa tu bandeja.</p>
            )}
          </>
        )}

        {state === 'notoken' && (
          <>
            <Mail size={48} className="mx-auto mb-4" style={{ color: 'var(--primary)' }} />
            <h1 className="text-[22px] font-bold mb-2">Verifica tu email</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
              Hemos enviado un enlace de verificación a tu email. Revisa tu bandeja de entrada.
            </p>
            <Link
              href="/dashboard"
              className="inline-block py-2.5 px-6 rounded-xl font-semibold text-sm no-underline border"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
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
