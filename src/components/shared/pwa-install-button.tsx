'use client';

import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export function PwaInstallButton({ collapsed = false }: { collapsed?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (deferredPrompt as any).prompt();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (deferredPrompt as any).userChoice;
    if (result.outcome === 'accepted') setCanInstall(false);
    setDeferredPrompt(null);
  };

  if (!canInstall) return null;

  return (
    <button
      type="button"
      onClick={handleInstall}
      title="Instalar como app"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : '8px',
        padding: collapsed ? '10px 8px' : '8px 12px',
        borderRadius: '10px',
        border: '1px solid rgba(228,20,20,0.32)',
        background: 'rgba(228,20,20,0.08)',
        color: '#e41414',
        fontSize: '13px',
        fontWeight: 700,
        cursor: 'pointer',
        width: '100%',
        marginBottom: '8px',
      }}
    >
      <Download size={18} style={{ flexShrink: 0 }} aria-hidden />
      {!collapsed ? 'Instalar app' : null}
    </button>
  );
}
