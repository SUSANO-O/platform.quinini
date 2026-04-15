'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="landing-auth-wrap">
      <div className="hero-glow" style={{ background: 'var(--accent-warm)', top: '-180px', right: '12%' }} />
      <div className="hero-glow" style={{ background: 'var(--gradient-start)', bottom: '-160px', left: '10%' }} />

      <div className="relative text-center max-w-md px-4">
        <p className="text-5xl mb-2 m-0" aria-hidden>
          ⚠️
        </p>
        <h1 className="text-[22px] font-bold mb-2">Algo salió mal</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
          Ocurrió un error inesperado. Nuestro equipo ha sido notificado.
          {error.digest && (
            <span className="block mt-2 text-[11px] font-mono opacity-60">Ref: {error.digest}</span>
          )}
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button type="button" onClick={reset} className="landing-btn-primary !w-auto px-6">
            Reintentar
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center py-2.5 px-6 rounded-xl font-semibold text-sm no-underline border transition-colors hover:bg-slate-50"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
          >
            ← Inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
