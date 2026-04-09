'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

declare global {
  interface Window {
    AgentFlowhub?: {
      init: (cfg: Record<string, unknown>) => { destroy?: () => void };
    };
  }
}

interface WidgetDoc {
  _id: string;
  name: string;
  agentId: string;
  color: string;
  title?: string;
  subtitle?: string;
  welcome?: string;
  fabHint?: string;
  avatar?: string;
  position: string;
  theme: string;
  borderRadius?: string;
  autoOpen?: boolean;
  afhubToken?: string | null;
}

function parseBorderRadius(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.min(32, Math.max(0, v));
  }
  const s = String(v ?? '');
  const n = parseInt(s.replace(/px/gi, '').trim(), 10);
  return Number.isFinite(n) ? Math.min(32, Math.max(0, n)) : 16;
}

export default function WidgetPreviewPage() {
  const [widget, setWidget] = useState<WidgetDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const instanceRef = useRef<{ destroy?: () => void } | null>(null);

  useEffect(() => {
    const id =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('id')
        : null;
    const valid = id && /^[a-f0-9]{24}$/i.test(id) ? id : null;

    if (!valid) {
      setError('Falta un id de widget válido en la URL (?id=…).');
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetch(`/api/widgets/${valid}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.widget) {
          setError(data.error || 'Widget no encontrado.');
          return;
        }
        setWidget(data.widget as WidgetDoc);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar el widget.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const teardown = useCallback(() => {
    try {
      instanceRef.current?.destroy?.();
    } catch {
      /* ignore */
    }
    instanceRef.current = null;
  }, []);

  useEffect(() => {
    if (!widget || typeof window === 'undefined') return;
    if (!widget.agentId?.trim()) return;

    const host = window.location.origin;
    if (!/^https?:\/\//i.test(host)) return;

    const snapshot = widget;

    let cancelled = false;

    async function boot() {
      teardown();
      const origin = window.location.origin;

      const loadScript = (): Promise<void> => {
        if (window.AgentFlowhub) return Promise.resolve();
        return new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = `${origin}/widget.js`;
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('No se pudo cargar widget.js'));
          document.body.appendChild(s);
        });
      };

      try {
        await loadScript();
        if (cancelled || !window.AgentFlowhub) return;

        const w = snapshot;
        const token = typeof w.afhubToken === 'string' && w.afhubToken.startsWith('wt_')
          ? w.afhubToken
          : '';

        const cfg: Record<string, unknown> = {
          agentId: w.agentId,
          widgetId: w._id,
          host,
          color: w.color || '#0d9488',
          title: w.title || 'Asistente',
          subtitle: w.subtitle || '',
          welcome: w.welcome || '',
          fabHint: w.fabHint || '',
          avatar: w.avatar || '',
          position: w.position || 'bottom-right',
          theme: w.theme === 'dark' ? 'dark' : 'light',
          borderRadius: parseBorderRadius(w.borderRadius),
          autoOpen: true,
          token,
        };

        const api = window.AgentFlowhub.init(cfg);
        instanceRef.current = api;
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error al iniciar el widget.');
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
      teardown();
    };
  }, [widget, teardown]);

  return (
    <div style={{ padding: '28px', maxWidth: '720px' }}>
      <Link href="/dashboard/widgets" style={{ fontSize: '13px', color: '#0d9488', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
        <ArrowLeft size={14} /> Volver a Mis widgets
      </Link>

      <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>Vista previa del widget</h1>
      <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '20px' }}>
        {widget
          ? `Probando «${widget.name}». Usa el botón flotante para chatear y comprobar que el agente responde.`
          : loading
            ? 'Cargando configuración…'
            : 'Abre esta vista desde Mis widgets con el botón Preview.'}
      </p>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--muted-foreground)' }}>
          <Loader2 size={20} style={{ animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontSize: '13px' }}>Cargando…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!loading && error && !widget && (
        <p style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          <AlertCircle size={18} /> {error}
        </p>
      )}

      {!loading && widget && error && (
        <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</p>
      )}

      {!loading && widget && !widget.agentId?.trim() && (
        <p style={{ color: '#f59e0b', fontSize: '13px' }}>
          Este widget no tiene agente asignado. Edítalo en el Widget Builder y elige un agente sincronizado con el hub.
        </p>
      )}
    </div>
  );
}
