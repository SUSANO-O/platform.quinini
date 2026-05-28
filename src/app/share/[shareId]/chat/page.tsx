'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface WidgetConfig {
  widgetId:   string;
  agentId:    string;
  afhubToken: string;
  name:       string;
  title:      string;
  subtitle:   string;
  avatar:     string;
  color:      string;
  welcome:    string;
}


export default function ShareChatPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const router      = useRouter();

  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [error, setError]   = useState('');

  useEffect(() => {
    fetch(`/api/share/${shareId}/config`)
      .then(r => {
        if (r.status === 401) { router.replace(`/share/${shareId}`); return null; }
        if (r.status === 410) { setError('Este enlace ha caducado.'); return null; }
        return r.json() as Promise<WidgetConfig & { error?: string }>;
      })
      .then(data => {
        if (!data) return;
        if ('error' in data) { setError(data.error ?? 'Error'); return; }
        setConfig(data);
      })
      .catch(() => setError('Error de red.'));
  }, [shareId, router]);

  useEffect(() => {
    if (!config) return;

    function initWidget(cfg: WidgetConfig) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const af = (window as any).AgentFlowhub;
      if (!af) return;

      const opts: Record<string, unknown> = {
        autoOpen:      true,
        initialLayout: 'sidebar-fullscreen',
        host:          window.location.origin,
      };
      if (cfg.afhubToken) {
        opts.token = cfg.afhubToken;
      } else {
        opts.agentId  = cfg.agentId;
        opts.widgetId = cfg.widgetId;
        opts.color    = cfg.color;
        opts.title    = cfg.title;
        opts.subtitle = cfg.subtitle;
        opts.avatar   = cfg.avatar;
        opts.welcome  = cfg.welcome;
      }

      af.init(opts);
    }

    const existing = document.getElementById('afhub-widget-script');
    if (existing) { initWidget(config); return; }

    const script    = document.createElement('script');
    script.id       = 'afhub-widget-script';
    script.src      = '/widget.js';
    script.async    = true;
    script.onload   = () => initWidget(config);
    script.onerror  = () => setError('No se pudo cargar el widget.');
    document.head.appendChild(script);
  }, [config]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <p style={{ fontSize: 18, marginBottom: 12 }}>⚠️ {error}</p>
          <button
            type="button"
            onClick={() => router.push(`/share/${shareId}`)}
            style={{ padding: '10px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Dark canvas — the widget covers it completely in fullscreen sidebar mode
  return <div style={{ minHeight: '100vh', background: '#0f172a' }} />;
}
