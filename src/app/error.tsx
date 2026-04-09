'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log to error tracking service here (Sentry, etc.)
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--background)', padding: '24px', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 460 }}>
        <p style={{ fontSize: '64px', fontWeight: 900, margin: '0 0 8px' }}>⚠️</p>
        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Algo salió mal</h1>
        <p style={{ color: 'var(--muted-foreground)', fontSize: '14px', marginBottom: '24px' }}>
          Ocurrió un error inesperado. Nuestro equipo ha sido notificado.
          {error.digest && (
            <span style={{ display: 'block', marginTop: '8px', fontSize: '11px', fontFamily: 'monospace', opacity: 0.6 }}>
              Ref: {error.digest}
            </span>
          )}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={reset}
            style={{
              padding: '10px 24px', borderRadius: '10px', background: '#6366f1', color: '#fff',
              border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
          <Link href="/" style={{
            display: 'inline-block', padding: '10px 24px', borderRadius: '10px',
            border: '1px solid var(--border)', color: 'var(--foreground)', textDecoration: 'none',
            fontWeight: 600, fontSize: '14px',
          }}>
            ← Inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
