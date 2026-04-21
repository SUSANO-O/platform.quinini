'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    AgentFlowhub?: {
      init: (cfg: Record<string, unknown>) => { destroy?: () => void };
    };
    __agentFlowhubLandingInitialized?: boolean;
  }
}

export function LandingWidgetScript() {
  useEffect(() => {
    if (window.__agentFlowhubLandingInitialized) return;

    const initWidget = () => {
      if (!window.AgentFlowhub || window.__agentFlowhubLandingInitialized) return;

      window.AgentFlowhub.init({
        agentId: 'math',
        host: 'https://control-matias.vercel.app',
        color: '#6366f1',
        title: 'Math',
        subtitle: 'En linea',
        welcome: 'Hola! Como puedo ayudarte hoy?',
        fabHint: '¿En qué podemos ayudarte?',
        position: 'right',
        edgeInset: 20,
        offsetBottom: 20,
        humanSupportPhone: '+57 3196748729',
        borderRadius: 16,
        theme: 'light',
        autoOpen: false,
        debug: false,
        onError: (err: unknown) => {
          console.error('Widget error', err);
        },
      });

      window.__agentFlowhubLandingInitialized = true;
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-agentflowhub-sdk="landing"]'
    );

    if (existingScript) {
      if (window.AgentFlowhub) {
        initWidget();
      } else {
        existingScript.addEventListener('load', initWidget, { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://control-matias.vercel.app/sdk/v1/widget.js';
    script.async = true;
    script.dataset.agentflowhubSdk = 'landing';
    script.addEventListener('load', initWidget, { once: true });
    document.body.appendChild(script);

    return () => {
      script.removeEventListener('load', initWidget);
    };
  }, []);

  return null;
}
