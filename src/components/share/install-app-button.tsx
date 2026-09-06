'use client';

import { useEffect, useState } from 'react';

/**
 * "Instalar como app" en la página de un share.
 *
 * No decide nada por su cuenta: se apoya en que el navegador solo dispara
 * `beforeinstallprompt` cuando el manifest de ESTE share existe y es válido.
 * Como el endpoint devuelve 404 para los shares que caducan, el botón
 * simplemente no aparece en ellos — sin duplicar la regla en el cliente.
 *
 * iOS no tiene ese evento (la instalación es manual desde Compartir), así que
 * ahí se comprueba el manifest y se explica el gesto en vez de ofrecer botón.
 */

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallAppButton({ shareId }: { shareId: string }) {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    // Ya está instalada: no tiene sentido ofrecerlo.
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault(); // sin esto el navegador muestra su propio aviso y perdemos el gesto
      setPrompt(e as PromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const esIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (esIOS) {
      // En iOS el evento no existe, así que hay que preguntarle al servidor.
      fetch(`/api/share/${encodeURIComponent(shareId)}/manifest`)
        .then((r) => setIosHint(r.ok))
        .catch(() => setIosHint(false));
    }

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [shareId]);

  if (prompt) {
    return (
      <button
        type="button"
        onClick={() => {
          void prompt.prompt();
          setPrompt(null); // el evento solo sirve una vez
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, margin: '18px auto 0',
          padding: '9px 16px', borderRadius: 999,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
        </svg>
        Instalar como app
      </button>
    );
  }

  if (iosHint) {
    return (
      <p style={{ margin: '18px auto 0', maxWidth: '22rem', fontSize: 12, lineHeight: 1.5, color: 'var(--muted-foreground)', textAlign: 'center' }}>
        Para tenerlo como app: <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong>.
      </p>
    );
  }

  return null;
}
