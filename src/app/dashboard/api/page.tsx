'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Lock, Code2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useSubscription } from '@/hooks/use-subscription';
import {
  apiAccessUpgradeLabel,
  canUseApiAccess,
  effectiveProductPlan,
} from '@/lib/plan-catalog';
import { getAgentflowApiDocsUrl, getAgentflowApiUrl } from '@/lib/agentflow-api-url';

export default function DashboardApiPage() {
  const { subscription, loading } = useSubscription();
  const plan = subscription?.plan ?? 'free';
  const status = subscription?.status ?? 'free';
  const effective = effectiveProductPlan(plan, status);
  const hasAccess = canUseApiAccess(plan, status);
  const docsUrl = getAgentflowApiDocsUrl();
  const apiBase = getAgentflowApiUrl();

  // Comprueba si el servicio API responde antes de embeber el iframe: si está
  // caído mostramos un aviso claro en vez del icono de «documento roto».
  // Reintenta varias veces porque el primer acceso a Nuxt compila la ruta en
  // frío y puede tardar más que el timeout inicial.
  const [apiStatus, setApiStatus] = useState<'checking' | 'up' | 'down'>('checking');
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${apiBase}/api/v1/health`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }, [apiBase]);

  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    setApiStatus('checking');
    (async () => {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        if (await checkHealth()) {
          if (!cancelled) setApiStatus('up');
          return;
        }
        if (attempt < 2 && !cancelled) await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) setApiStatus('down');
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAccess, checkHealth]);

  useEffect(() => {
    if (!hasAccess || apiStatus !== 'up') {
      setIframeSrc(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/docs-bridge', { credentials: 'include', cache: 'no-store' });
        const data = (await res.json()) as { token?: string };
        if (cancelled) return;
        if (res.ok && data.token) {
          const sep = docsUrl.includes('?') ? '&' : '?';
          setIframeSrc(`${docsUrl}${sep}session=${encodeURIComponent(data.token)}`);
        } else {
          setIframeSrc(docsUrl);
        }
      } catch {
        if (!cancelled) setIframeSrc(docsUrl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAccess, apiStatus, docsUrl]);

  const retryHealth = useCallback(async () => {
    setApiStatus('checking');
    setApiStatus((await checkHealth()) ? 'up' : 'down');
  }, [checkHealth]);

  if (loading) {
    return (
      <div className="p-6 max-w-3xl">
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Cargando…</p>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="relative overflow-hidden min-h-full p-6 max-w-2xl">
        <div
          className="rounded-2xl p-8 card-texture"
          style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(var(--brand-primary-rgb),0.1)' }}
          >
            <Lock size={22} style={{ color: 'var(--primary)' }} />
          </div>
          <h1 className="text-xl font-bold mb-2">API REST</h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--muted-foreground)' }}>
            La documentación interactiva y las claves de API están disponibles desde el plan{' '}
            <strong>{apiAccessUpgradeLabel()}</strong> en adelante. Tu plan actual:{' '}
            <strong>{effective}</strong>.
          </p>
          <Link
            href="/pricing#api"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'var(--brand-primary)' }}
          >
            Ver planes con API
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden min-h-full p-6 max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Code2 size={20} style={{ color: 'var(--primary)' }} />
          <h1 className="text-2xl font-bold">API REST</h1>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
          Documentación y prueba de endpoints en el servicio dedicado. Autenticación con{' '}
          <code className="text-xs">X-Api-Key</code> o{' '}
          <code className="text-xs">Authorization: Bearer afapi_…</code>.
        </p>
      </div>

      <div
        className="rounded-2xl overflow-hidden mb-6"
        style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-xs font-mono truncate" style={{ color: 'var(--muted-foreground)' }}>
            {docsUrl}
          </span>
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold shrink-0"
            style={{ color: 'var(--primary)' }}
          >
            Abrir en pestaña nueva
            <ExternalLink size={14} />
          </a>
        </div>
        {apiStatus === 'up' && iframeSrc ? (
          <iframe
            title="Documentación API BotIvA"
            src={iframeSrc}
            className="w-full border-0"
            style={{ height: 'min(72vh, 720px)', background: '#fff' }}
          />
        ) : apiStatus === 'up' ? (
          <div
            className="flex items-center justify-center px-6 py-16"
            style={{ height: 'min(72vh, 720px)' }}
          >
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Preparando sesión de documentación…
            </p>
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-3 text-center px-6 py-16"
            style={{ height: 'min(72vh, 720px)' }}
          >
            {apiStatus === 'checking' ? (
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                Conectando con el servicio de documentación…
              </p>
            ) : (
              <>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(245,158,11,0.12)' }}
                >
                  <AlertTriangle size={22} style={{ color: '#f59e0b' }} />
                </div>
                <p className="text-sm font-semibold m-0">No se pudo cargar la documentación</p>
                <p className="text-sm max-w-md m-0" style={{ color: 'var(--muted-foreground)' }}>
                  El servicio de API (<code className="text-xs">{apiBase}</code>) no está respondiendo.
                  Verifica que esté en marcha o ábrela directamente en una pestaña nueva.
                </p>
                <div className="flex items-center gap-4 mt-1">
                  <button
                    type="button"
                    onClick={retryHealth}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: 'var(--primary)' }}
                  >
                    <RefreshCw size={14} />
                    Reintentar
                  </button>
                  <a
                    href={docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: 'var(--primary)' }}
                  >
                    Abrir documentación
                    <ExternalLink size={14} />
                  </a>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div
        className="rounded-xl p-5 text-sm space-y-3"
        style={{ border: '1px solid var(--border)', background: 'var(--muted)' }}
      >
        <p className="font-semibold m-0">Primer acceso</p>
        <ol className="m-0 pl-5 space-y-2" style={{ color: 'var(--muted-foreground)' }}>
          <li>
            Obtén tu clave con{' '}
            <code className="text-xs">POST {apiBase}/api/v1/auth/token</code> (email + contraseña de BotIvA).
          </li>
          <li>Pega la clave en la documentación (botón Authorize) o envía el header en tus peticiones.</li>
          <li>Gestiona claves adicionales con <code className="text-xs">POST /api/v1/auth/keys</code>.</li>
        </ol>
      </div>
    </div>
  );
}
