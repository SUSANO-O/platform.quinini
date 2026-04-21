'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    AgentFlowhub?: {
      init: (cfg: Record<string, unknown>) => { destroy?: () => void };
    };
    __agentFlowhubLandingInitialized?: boolean;
  }
}

/** Misma URL que el snippet de la landing (cache-bust). */
const WIDGET_SCRIPT_SRC =
  'https://control-matias.vercel.app/sdk/v1/widget.js?v=2026-04-21T22%3A52%3A43.328Z';

const AFHUB_BOOT_MAX_TRIES = 20;
const AFHUB_BOOT_DELAY_MS = 120;

export function LandingWidgetScript() {
  const timeoutIdsRef = useRef<number[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.__agentFlowhubLandingInitialized) return;

    const clearPollTimeouts = () => {
      timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutIdsRef.current = [];
    };

    let afhubBootTries = 0;

    function afhubInitWhenReady() {
      if (window.__agentFlowhubLandingInitialized) return;

      if (window.AgentFlowhub && typeof window.AgentFlowhub.init === 'function') {
        window.AgentFlowhub.init({
          agentId: 'math',
          host: 'https://control-matias.vercel.app',
          color: '#f5540f',
          title: 'Math',
          subtitle: 'En linea',
          welcome: 'Hola! Como puedo ayudarte hoy?',
          fabHint: '¿En qué podemos ayudarte?',
          avatar:
            'https://img.freepik.com/premium-photo/bright-blue-orb_303714-30852.jpg',
          position: 'right',
          edgeInset: 20,
          offsetBottom: 20,
          offsetTop: 20,
          humanSupportPhone: '+57 3196748729',
          borderRadius: 16,
          theme: 'light',
          autoOpen: false,
          debug: false,
          onError: (err: unknown) => {
            console.error('[math] Widget error', err);
          },
        });
        window.__agentFlowhubLandingInitialized = true;
        clearPollTimeouts();
        return;
      }

      afhubBootTries += 1;
      if (afhubBootTries >= AFHUB_BOOT_MAX_TRIES) {
        console.error('[math] AgentFlowhub SDK no cargado');
        return;
      }
      const id = window.setTimeout(afhubInitWhenReady, AFHUB_BOOT_DELAY_MS);
      timeoutIdsRef.current.push(id);
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-agentflowhub-sdk="landing"]',
    );

    const onScriptLoaded = () => {
      afhubBootTries = 0;
      clearPollTimeouts();
      afhubInitWhenReady();
    };

    if (existingScript) {
      if (existingScript.src !== WIDGET_SCRIPT_SRC) {
        existingScript.src = WIDGET_SCRIPT_SRC;
      }
      if (window.AgentFlowhub) {
        onScriptLoaded();
      } else {
        existingScript.addEventListener('load', onScriptLoaded, { once: true });
      }
      return () => {
        existingScript.removeEventListener('load', onScriptLoaded);
        clearPollTimeouts();
      };
    }

    const script = document.createElement('script');
    script.src = WIDGET_SCRIPT_SRC;
    script.async = true;
    script.dataset.agentflowhubSdk = 'landing';
    script.addEventListener('load', onScriptLoaded, { once: true });
    document.body.appendChild(script);

    return () => {
      script.removeEventListener('load', onScriptLoaded);
      clearPollTimeouts();
    };
  }, []);

  return null;
}
