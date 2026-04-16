'use client';

/**
 * Punto de entrada del enlace del correo (?token=…): verifica en la API, muestra toasts y redirige.
 * El reenvío de correo vive en Ajustes → Cuenta (no hace falta UI aquí).
 */

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function VerifyEmailGate() {
  const params = useSearchParams();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const token = params.get('token');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) {
        toast.info('Reenvía el enlace desde Ajustes → Cuenta, botón «Reenviar correo de verificación».');
        if (!cancelled) router.replace('/dashboard/settings');
        return;
      }

      try {
        const r = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const d = (await r.json()) as { ok?: boolean; error?: string };
        if (cancelled) return;
        if (d.ok) {
          await refreshUser();
          toast.success('Correo verificado correctamente.');
        } else {
          toast.error(d.error || 'El enlace no es válido o ha caducado.');
        }
      } catch {
        if (!cancelled) toast.error('No se pudo verificar. Comprueba tu conexión.');
      } finally {
        if (!cancelled) router.replace('/dashboard/settings');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router, refreshUser]);

  return (
    <div
      className="min-h-[50vh] flex flex-col items-center justify-center gap-3 px-6"
      style={{ background: 'var(--background)' }}
    >
      <Loader2 className="animate-spin" size={28} style={{ color: 'var(--primary)' }} aria-hidden />
      <p className="text-sm m-0" style={{ color: 'var(--muted-foreground)' }}>
        {token ? 'Verificando tu correo…' : 'Redirigiendo a ajustes…'}
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center" style={{ background: 'var(--background)' }}>
          <Loader2 className="animate-spin" size={28} style={{ color: 'var(--primary)' }} aria-hidden />
        </div>
      }
    >
      <VerifyEmailGate />
    </Suspense>
  );
}
