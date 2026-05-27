'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Sparkles, KeyRound } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!registrationCode.trim()) {
      setError('El código de autorización es requerido.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (!/[a-z]/.test(password)) {
      setError('La contraseña debe contener al menos una letra minúscula.');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError('La contraseña debe contener al menos una letra mayúscula.');
      return;
    }
    if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
      setError('La contraseña debe contener al menos un número o carácter especial.');
      return;
    }
    setLoading(true);
    const result = await register(email, password, name || undefined, registrationCode.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
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
            <Image src={BRAND_LOGO_SRC} alt={BRAND_NAME} width={180} height={54} className="h-14 w-auto object-contain rounded-xl shadow-md" priority />
            <span className="text-2xl font-bold text-black">{BRAND_NAME}</span>
          </Link>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Prueba gratuita de 7 días — requiere código de invitación
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
              <label htmlFor="register-name" className="block text-[13px] font-semibold mb-1.5">Nombre</label>
              <input
                id="register-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
              <input
                id="register-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Mínimo 8 caracteres"
                className="landing-input"
                autoComplete="new-password"
              />
            </div>

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
