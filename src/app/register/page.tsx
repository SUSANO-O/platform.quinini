'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setLoading(true);
    const result = await register(email, password, name || undefined);
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
      <div className="hero-glow" style={{ background: 'var(--accent-cyan)', top: '35%', left: '50%' }} />

      <div className="relative w-full max-w-[440px]">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-3 no-underline">
            <Image src="/t.jpg" alt="MatIAs" width={56} height={56} className="rounded-xl object-cover shadow-md" style={{ aspectRatio: '1/1' }} />
            <span className="text-2xl font-bold gradient-text">MatIAs</span>
          </Link>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Empieza tu prueba gratuita de 5 días
          </p>
        </div>

        <div
          className="rounded-2xl px-4 py-3.5 mb-6 flex items-start gap-3 border"
          style={{
            background: 'linear-gradient(135deg, rgba(228,20,20,0.08), rgba(248,118,0,0.08))',
            borderColor: 'rgba(228,20,20,0.22)',
          }}
        >
          <Sparkles className="shrink-0 mt-0.5" size={18} style={{ color: 'var(--primary)' }} />
          <div>
            <p className="font-bold text-[13px] m-0">5 días gratis, sin tarjeta</p>
            <p className="text-xs m-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              Acceso completo al Widget Builder y todos los agentes
            </p>
          </div>
        </div>

        <div className="landing-card p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[13px] font-semibold mb-1.5">Nombre</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                className="landing-input"
              />
            </div>
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
                placeholder="Mínimo 6 caracteres"
                className="landing-input"
              />
            </div>

            {error && (
              <p className="text-[13px] text-red-600 bg-red-500/10 px-3.5 py-2.5 rounded-lg border border-red-500/20">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="landing-btn-primary">
              {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
            </button>

            <p className="text-[11px] text-center leading-relaxed m-0" style={{ color: 'var(--muted-foreground)' }}>
              Al registrarte aceptas los Términos de Servicio. Después de 5 días se requiere suscripción.
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
