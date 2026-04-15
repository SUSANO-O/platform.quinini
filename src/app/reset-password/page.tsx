'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
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
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? 'Error. Intenta de nuevo.');
      return;
    }
    setSuccess(true);
    setTimeout(() => router.push('/login'), 3000);
  }

  return (
    <div className="landing-auth-wrap">
      <div className="hero-glow" style={{ background: 'var(--accent-warm)', top: '-180px', right: '8%' }} />
      <div className="hero-glow" style={{ background: 'var(--gradient-start)', bottom: '-120px', left: '15%' }} />

      <div className="relative w-full max-w-[400px] landing-card p-9">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-7 no-underline">
          <Image src="/t.jpg" alt="MatIAs" width={36} height={36} className="rounded-xl object-cover" style={{ aspectRatio: '1/1' }} />
          <span className="text-lg font-bold gradient-text">MatIAs</span>
        </Link>

        {success ? (
          <div className="text-center">
            <CheckCircle size={48} className="mx-auto mb-4 text-green-600" />
            <h1 className="text-xl font-bold mb-2">Contraseña actualizada</h1>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Serás redirigido al login...
            </p>
          </div>
        ) : (
          <>
            <Lock size={32} className="mb-4" style={{ color: 'var(--primary)' }} />
            <h1 className="text-[22px] font-bold mb-1.5">Nueva contraseña</h1>
            <p className="text-[13px] mb-6" style={{ color: 'var(--muted-foreground)' }}>
              Crea una contraseña segura de al menos 8 caracteres.
            </p>

            {!token && (
              <div className="text-[13px] px-3 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 mb-4">
                Enlace inválido.{' '}
                <Link href="/forgot-password" className="font-bold text-red-600 underline">
                  Solicitar uno nuevo →
                </Link>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Nueva contraseña</label>
                <div className="relative">
                  <input
                    className="landing-input pr-10"
                    type={show ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-0 cursor-pointer p-0"
                    style={{ color: 'var(--muted-foreground)' }}
                    aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Confirmar contraseña</label>
                <input
                  className="landing-input"
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                />
              </div>

              {error && (
                <div className="text-[13px] px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !token}
                className="landing-btn-primary flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar contraseña'
                )}
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
