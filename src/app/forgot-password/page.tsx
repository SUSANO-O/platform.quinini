'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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

    if (!res.ok) {
      setError(data.error ?? 'Error. Intenta de nuevo.');
      return;
    }
    setSent(true);
  }

  return (
    <div className="landing-auth-wrap">
      <div className="hero-glow" style={{ background: 'var(--gradient-start)', top: '-200px', left: '12%' }} />
      <div className="hero-glow" style={{ background: 'var(--accent)', top: '20%', right: '0' }} />

      <div className="relative w-full max-w-[400px] landing-card p-9">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-7 no-underline">
          <Image src="/t.jpg" alt="MatIAs" width={36} height={36} className="rounded-xl object-cover" style={{ aspectRatio: '1/1' }} />
          <span className="text-lg font-bold gradient-text">MatIAs</span>
        </Link>

        {sent ? (
          <div className="text-center">
            <CheckCircle size={48} className="mx-auto mb-4 text-green-600" />
            <h1 className="text-xl font-bold mb-2">Email enviado</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
              Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada.
            </p>
            <Link href="/login" className="landing-btn-primary no-underline !w-auto inline-flex px-6">
              ← Volver al login
            </Link>
          </div>
        ) : (
          <>
            <Mail size={32} className="mb-4" style={{ color: 'var(--primary)' }} />
            <h1 className="text-[22px] font-bold mb-1.5">Recuperar contraseña</h1>
            <p className="text-[13px] mb-6" style={{ color: 'var(--muted-foreground)' }}>
              Ingresa tu email y te enviaremos un enlace para crear una nueva contraseña.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Email</label>
                <input
                  className="landing-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                />
              </div>

              {error && (
                <div className="text-[13px] px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="landing-btn-primary flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar enlace'
                )}
              </button>
            </form>

            <p className="text-center text-[13px] mt-5 mb-0" style={{ color: 'var(--muted-foreground)' }}>
              <Link href="/login" className="landing-link-accent">
                ← Volver al login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
