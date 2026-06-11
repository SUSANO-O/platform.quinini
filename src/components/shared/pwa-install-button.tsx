'use client';

import { useState, useEffect } from 'react';
import { Download, Share } from 'lucide-react';

declare global {
  interface Window {
    __pwaPrompt?: Event;
  }
}

type InstallMode = 'android' | 'ios' | null;

export function PwaInstallButton({ collapsed = false }: { collapsed?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [mode, setMode] = useState<InstallMode>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    // Ya instalada como PWA — no mostrar
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari =
      /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios/i.test(navigator.userAgent);

    if (isIos && isSafari) {
      setMode('ios');
      return;
    }

    // Evento ya capturado por el script inline antes de que React montara
    if (window.__pwaPrompt) {
      setDeferredPrompt(window.__pwaPrompt);
      setMode('android');
      return;
    }

    // Fallback: escuchar si aún no llegó
    const handler = (e: Event) => {
      e.preventDefault();
      window.__pwaPrompt = e;
      setDeferredPrompt(e);
      setMode('android');
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (deferredPrompt as any).prompt();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (deferredPrompt as any).userChoice;
    if (result.outcome === 'accepted') {
      setMode(null);
      window.__pwaPrompt = undefined;
    }
    setDeferredPrompt(null);
  };

  if (!mode) return null;

  if (mode === 'ios') {
    return (
      <div style={{ marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setShowIosHint((v) => !v)}
          title="Instalar como app"
          className={`pwa-install-btn${collapsed ? ' pwa-install-btn--collapsed' : ''}`}
        >
          <Share size={18} style={{ flexShrink: 0 }} aria-hidden />
          {!collapsed ? 'Instalar app' : null}
        </button>
        {showIosHint && !collapsed && (
          <div style={{
            marginTop: 8,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(var(--brand-primary-rgb),0.06)',
            border: '1px solid rgba(var(--brand-primary-rgb),0.2)',
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--foreground)',
          }}>
            Toca <strong>Compartir</strong> <Share size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> en Safari y luego <strong>&quot;Añadir a pantalla de inicio&quot;</strong>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleAndroidInstall}
      title="Instalar como app"
      className={`pwa-install-btn${collapsed ? ' pwa-install-btn--collapsed' : ''}`}
      style={{ marginBottom: 8 }}
    >
      <Download size={18} style={{ flexShrink: 0 }} aria-hidden />
      {!collapsed ? 'Instalar app' : null}
    </button>
  );
}
