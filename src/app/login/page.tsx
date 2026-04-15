'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      const destination = result.user?.role === 'admin' ? '/admin' : from;
      router.push(destination);
    }
  }

  return (
    <div className="landing-auth-wrap">
      <div className="hero-glow" style={{ background: 'var(--gradient-start)', top: '-200px', left: '8%' }} />
      <div className="hero-glow" style={{ background: 'var(--accent-warm)', top: '-100px', right: '5%' }} />
      <div className="hero-glow" style={{ background: 'var(--accent)', top: '40%', left: '45%' }} />

      <div className="relative w-full max-w-[420px]">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-3 no-underline">
            <Image src="/t.jpg" alt="MatIAs" width={56} height={56} className="rounded-xl object-cover shadow-md" style={{ aspectRatio: '1/1' }} />
            <span className="text-2xl font-bold gradient-text">MatIAs</span>
          </Link>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Inicia sesión en tu cuenta
          </p>
        </div>

        <div className="landing-card p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[13px] font-semibold mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="tu@email.com"
                className="landing-input"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="landing-input"
              />
            </div>

            {error && (
              <p className="text-[13px] text-red-600 bg-red-500/10 px-3.5 py-2.5 rounded-lg border border-red-500/20">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="landing-btn-primary">
              {loading ? 'Iniciando...' : 'Iniciar sesión'}
            </button>
          </form>
        </div>

        <p className="text-center mt-3 text-[13px]">
          <Link href="/forgot-password" className="landing-link-accent opacity-90 hover:opacity-100">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
        <p className="text-center mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          ¿No tienes cuenta?{' '}
          <Link href="/register" className="landing-link-accent">
            Regístrate gratis
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
