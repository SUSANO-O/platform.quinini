'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Eye, EyeOff, Check } from '@/components/ui/icons';
import { useAuth } from '@/hooks/use-auth';
import { BotivaOrbLogo } from '@/components/brand/botiva-orb-logo';
import { BRAND_NAME } from '@/lib/brand';
import { TurnstileWidget } from '@/components/ui/turnstile-widget';
import type { TurnstileInstance } from '@marsidev/react-turnstile';

const CAPTCHA_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

function validatePasswordClient(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[a-z]/.test(password)) return 'La contraseña debe contener al menos una letra minúscula.';
  if (!/[A-Z]/.test(password)) return 'La contraseña debe contener al menos una letra mayúscula.';
  if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return 'La contraseña debe contener al menos un número o carácter especial.';
  }
  return null;
}

const PASSWORD_RULES = [
  { id: 'len', label: 'Mínimo 8 caracteres', test: (p: string) => p.length >= 8 },
  { id: 'lower', label: 'Una minúscula', test: (p: string) => /[a-z]/.test(p) },
  { id: 'upper', label: 'Una mayúscula', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'special', label: 'Un número o símbolo', test: (p: string) => /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p) },
] as const;

function PasswordToggle({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-0 cursor-pointer p-0"
      style={{ color: 'var(--muted-foreground)' }}
      aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
    >
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registrationCode, setRegistrationCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cfToken, setCfToken] = useState('');
  const turnstileRef = useRef<TurnstileInstance>(null);

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!registrationCode.trim()) {
      setError('El código de autorización es requerido.');
      return;
    }
    if (!name.trim()) {
      setError('Indica tu nombre para personalizar tu cuenta.');
      return;
    }
    const pwError = validatePasswordClient(password);
    if (pwError) {
      setError(pwError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (CAPTCHA_ENABLED && !cfToken) {
      setError('Completa la verificación de seguridad antes de continuar.');
      return;
    }
    setLoading(true);
    const result = await register(
      email,
      password,
      name.trim(),
      registrationCode.trim(),
      cfToken || undefined,
    );
    setLoading(false);
    if (result.error) {
      setError(result.error);
      turnstileRef.current?.reset();
      setCfToken('');
    } else {
      router.push('/dashboard');
    }
  }

  return (
    <div className="landing-auth-wrap">
      <div className="hero-glow" style={{ background: 'var(--gradient-start)', top: '-200px', right: '10%' }} />
      <div className="hero-glow" style={{ background: 'var(--accent-warm)', top: '-80px', left: '5%' }} />
      <div className="hero-glow" style={{ background: 'var(--brand-primary)', top: '35%', left: '50%' }} />

      <div className="relative w-full max-w-[440px]">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-3 no-underline">
            <BotivaOrbLogo size={56} variant="detailed" className="shrink-0" />
            <span className="text-2xl font-bold text-black">{BRAND_NAME}</span>
          </Link>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Requiere código de invitación y plan de pago activo
          </p>
        </div>

        <div
          className="rounded-2xl px-4 py-3.5 mb-6 flex items-start gap-3 border"
          style={{
            background: 'rgba(var(--brand-primary-rgb),0.08)',
            borderColor: 'rgba(var(--brand-primary-rgb),0.22)',
          }}
        >
          <KeyRound className="shrink-0 mt-0.5" size={18} style={{ color: 'var(--primary)' }} />
          <div>
            <p className="font-bold text-[13px] m-0">Acceso por invitación</p>
            <p className="text-xs m-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              Necesitas un código de autorización para crear tu cuenta.{' '}
              <Link href="/preguntas-frecuentes" className="landing-link-accent">
                ¿Cómo lo obtengo?
              </Link>
            </p>
          </div>
        </div>

        <div className="landing-card p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="register-code" className="block text-[13px] font-semibold mb-1.5">
                Código de autorización
              </label>
              <input
                id="register-code"
                type="text"
                value={registrationCode}
                onChange={(e) => setRegistrationCode(e.target.value.toUpperCase())}
                required
                placeholder="XXXX-XXXX"
                autoCapitalize="characters"
                spellCheck={false}
                className="landing-input"
                style={{ letterSpacing: '0.08em', fontFamily: 'monospace' }}
              />
            </div>
            <div>
              <label htmlFor="register-name" className="block text-[13px] font-semibold mb-1.5">
                Nombre <span style={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>(obligatorio)</span>
              </label>
              <input
                id="register-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Tu nombre"
                className="landing-input"
                autoComplete="name"
              />
            </div>
            <div>
              <label htmlFor="register-email" className="block text-[13px] font-semibold mb-1.5">Email</label>
              <input
                id="register-email"
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
              <label htmlFor="register-password" className="block text-[13px] font-semibold mb-1.5">Contraseña</label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Crea una contraseña segura"
                  className="landing-input pr-10"
                  autoComplete="new-password"
                />
                <PasswordToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
              </div>
              {password.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 m-0 p-0 list-none">
                  {PASSWORD_RULES.map((rule) => {
                    const ok = rule.test(password);
                    return (
                      <li
                        key={rule.id}
                        className="flex items-center gap-1.5 text-[11px]"
                        style={{ color: ok ? '#16a34a' : 'var(--muted-foreground)' }}
                      >
                        <Check size={12} strokeWidth={ok ? 2.5 : 2} style={{ opacity: ok ? 1 : 0.35 }} />
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div>
              <label htmlFor="register-password-confirm" className="block text-[13px] font-semibold mb-1.5">
                Confirmar contraseña
              </label>
              <div className="relative">
                <input
                  id="register-password-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repite la contraseña"
                  className="landing-input pr-10"
                  autoComplete="new-password"
                  aria-invalid={confirmPassword.length > 0 && !passwordsMatch}
                />
                <PasswordToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-[11px] text-red-600 mt-1.5 mb-0">Las contraseñas no coinciden.</p>
              )}
            </div>

            <TurnstileWidget
              ref={turnstileRef}
              onSuccess={(token) => setCfToken(token)}
              onExpire={() => setCfToken('')}
              onError={() => { setCfToken(''); setError('Error en la verificación de seguridad. Recarga la página.'); }}
            />

            {error && (
              <p className="text-[13px] text-red-600 bg-red-500/10 px-3.5 py-2.5 rounded-lg border border-red-500/20">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="landing-btn-primary">
              {loading ? 'Verificando código...' : 'Crear cuenta'}
            </button>

            <p className="text-[11px] text-center leading-relaxed m-0" style={{ color: 'var(--muted-foreground)' }}>
              Al registrarte aceptas los{' '}
              <Link href="/terminos-y-condiciones" className="landing-link-accent">Términos de Servicio</Link>
              {' '}y la{' '}
              <Link href="/politica-de-privacidad" className="landing-link-accent">Política de Privacidad</Link>.
            </p>
          </form>
        </div>

        <p className="text-center mt-5 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="landing-link-accent">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
