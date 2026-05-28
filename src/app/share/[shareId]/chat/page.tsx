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
  const [ready, setReady]   = useState(false);

  useEffect(() => {
    fetch(`/api/share/${shareId}/config`)
      .then(r => {
        if (r.status === 401) {
          router.replace(`/share/${shareId}`);
          return null;
        }
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

    const existingScript = document.getElementById('afhub-widget-script');
    if (existingScript) {
      initWidget(config);
      return;
    }

    const script    = document.createElement('script');
    script.id       = 'afhub-widget-script';
    script.src      = '/widget.js';
    script.async    = true;
    script.onload   = () => { initWidget(config); };
    script.onerror  = () => setError('No se pudo cargar el widget.');
    document.head.appendChild(script);
  }, [config]);

  function initWidget(cfg: WidgetConfig) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const af = (window as any).AgentFlowhub;
    if (!af) return;

    const initOpts: Record<string, unknown> = {
      autoOpen: true,
      host:     window.location.origin,
    };

    if (cfg.afhubToken) {
      initOpts.token = cfg.afhubToken;
    } else {
      initOpts.agentId  = cfg.agentId;
      initOpts.widgetId = cfg.widgetId;
      initOpts.color    = cfg.color;
      initOpts.title    = cfg.title;
      initOpts.subtitle = cfg.subtitle;
      initOpts.avatar   = cfg.avatar;
      initOpts.welcome  = cfg.welcome;
    }

    af.init(initOpts);
    setReady(true);
  }

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

  return (
    <>
      {/* Header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        height: 56,
        background: 'rgba(15,23,42,0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(99,102,241,0.2)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
        fontFamily: 'system-ui, sans-serif',
      }}>
        {config.avatar ? (
          <img
            src={config.avatar}
            alt=""
            style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${config.color}` }}
          />
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: config.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff', fontWeight: 700 }}>
            {config.title.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{config.title}</p>
          {config.subtitle && (
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 11, lineHeight: 1.2 }}>{config.subtitle}</p>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: ready ? '#22c55e' : '#64748b' }} />
          <span style={{ color: '#64748b', fontSize: 11 }}>{ready ? 'En línea' : 'Conectando…'}</span>
        </div>
      </div>

      {/* Background behind floating widget */}
      <div style={{
        position: 'fixed',
        top: 56,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#0f172a',
      }} />
    </>
  );
}
