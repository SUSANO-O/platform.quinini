'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { isAppMatiasWidgetPath, isLandingMarketingPath } from '@/lib/landing-widget-paths';

declare global {
  interface Window {
    AgentFlowhub?: {
      init: (cfg: Record<string, unknown>) => { destroy?: () => void } | void;
    };
  }
}

/** Mismo SDK para landing (math) y app (math-ais). */
const WIDGET_SCRIPT_SRC =
  'https://control-matias.vercel.app/sdk/v1/widget.js?v=2026-04-22T00%3A49%3A20.860Z';

const SCRIPT_DATA_ATTR = 'control-matias';
const AFHUB_BOOT_MAX_TRIES = 20;
const AFHUB_BOOT_DELAY_MS = 120;

const MATH_LANDING: Record<string, unknown> = {
  agentId: 'math',
  host: 'https://control-matias.vercel.app',
  color: '#f5540f',
  title: 'Math',
  subtitle: 'En linea',
  welcome: 'Hola! Como puedo ayudarte hoy?',
  fabHint: 'preguntame lo que necesites',
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
};

const MATH_AIS_APP: Record<string, unknown> = {
  agentId: 'math-ais',
  host: 'https://control-matias.vercel.app',
  color: '#fb0e0e',
  title: 'Math-ais',
  subtitle: 'En linea',
  welcome: 'Hola! Como puedo ayudarte hoy?',
  fabHint: '¿tienes duda en el uso?',
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
    console.error('[math-ais] Widget error', err);
  },
};

/**
 * Carga el SDK de control-matias una vez y muestra:
 * - **math** solo en rutas marketing (`isLandingMarketingPath`)
 * - **math-ais** solo en `/dashboard` (no en `/admin`)
 */
export function LandingWidgetScript() {
  const pathname = usePathname();
  const timeoutIdsRef = useRef<number[]>([]);
  const instanceRef = useRef<{ destroy?: () => void } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const clearPollTimeouts = () => {
      timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutIdsRef.current = [];
    };

    const onLanding = isLandingMarketingPath(pathname);
    const onApp = isAppMatiasWidgetPath(pathname);
    if (!onLanding && !onApp) {
      clearPollTimeouts();
      try {
        instanceRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      instanceRef.current = null;
      document
        .querySelector<HTMLScriptElement>(`script[data-agentflowhub-sdk="${SCRIPT_DATA_ATTR}"]`)
        ?.remove();
      return;
    }

    const config = onLanding ? MATH_LANDING : MATH_AIS_APP;
    const logTag = onLanding ? '[math]' : '[math-ais]';
    const pathOk = () =>
      onLanding ? isLandingMarketingPath(window.location.pathname) : isAppMatiasWidgetPath(window.location.pathname);

    let cancelled = false;

    const destroyInstance = () => {
      clearPollTimeouts();
      try {
        instanceRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      instanceRef.current = null;
    };

    let afhubBootTries = 0;

    function afhubInitWhenReady() {
      if (cancelled || !pathOk()) return;
      if (instanceRef.current) return;

      if (window.AgentFlowhub && typeof window.AgentFlowhub.init === 'function') {
        const api = window.AgentFlowhub.init(config);
        if (api && typeof api === 'object' && 'destroy' in api) {
          instanceRef.current = api as { destroy?: () => void };
        }
        clearPollTimeouts();
        return;
      }

      afhubBootTries += 1;
      if (afhubBootTries >= AFHUB_BOOT_MAX_TRIES) {
        console.error(`${logTag} AgentFlowhub SDK no cargado`);
        return;
      }
      const id = window.setTimeout(afhubInitWhenReady, AFHUB_BOOT_DELAY_MS);
      timeoutIdsRef.current.push(id);
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[data-agentflowhub-sdk="${SCRIPT_DATA_ATTR}"]`,
    );

    const onScriptLoaded = () => {
      if (cancelled) return;
      destroyInstance();
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
        cancelled = true;
        existingScript.removeEventListener('load', onScriptLoaded);
        destroyInstance();
      };
    }

    const script = document.createElement('script');
    script.src = WIDGET_SCRIPT_SRC;
    script.async = true;
    script.dataset.agentflowhubSdk = SCRIPT_DATA_ATTR;
    script.addEventListener('load', onScriptLoaded, { once: true });
    document.body.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener('load', onScriptLoaded);
      destroyInstance();
    };
  }, [pathname]);

  return null;
}
