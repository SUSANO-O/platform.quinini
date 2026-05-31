'use client';

import { useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';
import { TurnstileWidget } from '@/components/ui/turnstile-widget';
import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { ShieldCheck } from 'lucide-react';

const CAPTCHA_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

function LoginForm() {
  const { login, complete2FA } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/dashboard';
  const sessionExpired = searchParams.get('session') === 'expired';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [cfToken, setCfToken] = useState('');
  const turnstileRef = useRef<TurnstileInstance>(null);

  // Estado del paso 2FA
  const [twoFAStep, setTwoFAStep] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setErrorCode('');

    if (CAPTCHA_ENABLED && !cfToken) {
      setError('Completa la verificación de seguridad antes de continuar.');
      return;
    }

    setLoading(true);
    const result = await login(email, password, cfToken || undefined);
    setLoading(false);

    if (result.error) {
      setError(result.error);
      setErrorCode(result.code || '');
      turnstileRef.current?.reset();
      setCfToken('');
    } else if (result.requires2FA && result.tempToken) {
      setTempToken(result.tempToken);
      setTwoFAStep(true);
    } else {
      const destination = result.user?.role === 'admin' ? '/admin' : from;
      router.push(destination);
    }
  }

  async function handle2FASubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await complete2FA(tempToken, totpCode.replace(/\s/g, ''));
    setLoading(false);

    if (result.error) {
      setError(result.error);
      setTotpCode('');
    } else {
      const destination = result.user?.role === 'admin' ? '/admin' : from;
      router.push(destination);
    }
  }

  if (twoFAStep) {
    return (
      <div className="landing-auth-wrap">
        <div className="hero-glow" style={{ background: 'var(--gradient-start)', top: '-200px', left: '8%' }} />
        <div className="hero-glow" style={{ background: 'var(--accent-warm)', top: '-100px', right: '5%' }} />

        <div className="relative w-full max-w-[420px]">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex flex-col items-center gap-3 no-underline">
              <Image src={BRAND_LOGO_SRC} alt={BRAND_NAME} width={180} height={54} className="h-14 w-auto object-contain rounded-xl shadow-md" priority />
              <span className="text-2xl font-bold text-black">{BRAND_NAME}</span>
            </Link>
          </div>

          <div className="landing-card p-8">
            <div className="flex items-center gap-3 mb-5">
              <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(var(--brand-primary-rgb),0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShieldCheck size={20} style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <p className="font-bold text-[14px] m-0">Verificación en dos pasos</p>
                <p className="text-[12px] m-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  Ingresa el código de 6 dígitos de tu app autenticadora
                </p>
              </div>
            </div>

            <form onSubmit={handle2FASubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="totp-code" className="block text-[13px] font-semibold mb-1.5">Código</label>
                <input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                  autoFocus
                  className="landing-input"
                  style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: '22px', fontFamily: 'monospace' }}
                  autoComplete="one-time-code"
                />
              </div>

              {error && (
                <p className="text-[13px] text-red-600 bg-red-500/10 px-3.5 py-2.5 rounded-lg border border-red-500/20">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading || totpCode.length < 6} className="landing-btn-primary">
                {loading ? 'Verificando...' : 'Verificar'}
              </button>

              <button
                type="button"
                onClick={() => { setTwoFAStep(false); setError(''); setTotpCode(''); }}
                className="text-[12px] text-center"
                style={{ color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ← Volver al inicio de sesión
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-auth-wrap">
      <div className="hero-glow" style={{ background: 'var(--gradient-start)', top: '-200px', left: '8%' }} />
      <div className="hero-glow" style={{ background: 'var(--accent-warm)', top: '-100px', right: '5%' }} />
      <div className="hero-glow" style={{ background: 'var(--accent)', top: '40%', left: '45%' }} />

      <div className="relative w-full max-w-[420px]">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-3 no-underline">
            <Image src={BRAND_LOGO_SRC} alt={BRAND_NAME} width={180} height={54} className="h-14 w-auto object-contain rounded-xl shadow-md" priority />
            <span className="text-2xl font-bold text-black">{BRAND_NAME}</span>
          </Link>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Inicia sesión en tu cuenta
          </p>
          {sessionExpired && (
            <p className="mt-3 text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              Tu sesión expiró por inactividad. Vuelve a iniciar sesión.
            </p>
          )}
        </div>

        <div className="landing-card p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="login-email" className="block text-[13px] font-semibold mb-1.5">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="tu@email.com"
                className="landing-input"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-[13px] font-semibold mb-1.5">Contraseña</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="landing-input"
                autoComplete="current-password"
              />
            </div>

            <TurnstileWidget
              ref={turnstileRef}
              onSuccess={(token) => setCfToken(token)}
              onExpire={() => setCfToken('')}
              onError={() => { setCfToken(''); setError('Error en la verificación de seguridad. Recarga la página.'); }}
            />

            {error && (
              <div className="text-[13px] text-red-600 bg-red-500/10 px-3.5 py-2.5 rounded-lg border border-red-500/20">
                <p className="m-0">{error}</p>
                {errorCode === 'USER_NOT_REGISTERED' && (
                  <p className="m-0 mt-2">
                    <Link href="/register" className="landing-link-accent font-semibold">
                      Crear una cuenta →
                    </Link>
                  </p>
                )}
              </div>
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
