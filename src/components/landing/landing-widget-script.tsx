'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { isAppBotIvAWidgetPath, isLandingMarketingPath } from '@/lib/landing-widget-paths';

const SCRIPT_DATA_ATTR = 'botiva-landing-sdk';
const AFHUB_BOOT_MAX_TRIES = 20;
const AFHUB_BOOT_DELAY_MS = 120;

function resolveWidgetRuntime() {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3201').replace(/\/$/, '');

  const scriptOverride = process.env.NEXT_PUBLIC_LANDING_WIDGET_SCRIPT_URL?.trim();

  return {
    host: origin,
    scriptSrc: scriptOverride || `${origin}/widget.js`,
  };
}

function buildLandingConfig(host: string): Record<string, unknown> {
  return {
    agentId: 'math',
    host,
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
}

function buildAppConfig(host: string): Record<string, unknown> {
  return {
    agentId: 'math-ais',
    host,
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
}

/**
 * Carga `/widget.js` del mismo origen (local o producción) y muestra:
 * - **math** en rutas marketing
 * - **math-ais** en `/dashboard` (no en `/admin` ni widget-preview)
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
    const onApp = isAppBotIvAWidgetPath(pathname);
    if (!onLanding && !onApp) {
      clearPollTimeouts();
      try {
        instanceRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      instanceRef.current = null;
      document.querySelector('.afhub-launcher')?.remove();
      document.querySelector('.afhub-chat-container')?.remove();
      document
        .querySelector<HTMLScriptElement>(`script[data-agentflowhub-sdk="${SCRIPT_DATA_ATTR}"]`)
        ?.remove();
      return;
    }

    const { host, scriptSrc } = resolveWidgetRuntime();
    const config = onLanding ? buildLandingConfig(host) : buildAppConfig(host);
    const logTag = onLanding ? '[math]' : '[math-ais]';
    const pathOk = () =>
      onLanding ? isLandingMarketingPath(window.location.pathname) : isAppBotIvAWidgetPath(window.location.pathname);

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

    const onScriptError = () => {
      console.error(`${logTag} No se pudo cargar ${scriptSrc}`);
    };

    if (existingScript) {
      if (existingScript.src !== scriptSrc) {
        existingScript.src = scriptSrc;
      }
      if (window.AgentFlowhub) {
        onScriptLoaded();
      } else {
        existingScript.addEventListener('load', onScriptLoaded, { once: true });
        existingScript.addEventListener('error', onScriptError, { once: true });
      }
      return () => {
        cancelled = true;
        existingScript.removeEventListener('load', onScriptLoaded);
        existingScript.removeEventListener('error', onScriptError);
        destroyInstance();
      };
    }

    const script = document.createElement('script');
    script.src = scriptSrc;
    script.async = true;
    script.dataset.agentflowhubSdk = SCRIPT_DATA_ATTR;
    script.addEventListener('load', onScriptLoaded, { once: true });
    script.addEventListener('error', onScriptError, { once: true });
    document.body.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener('load', onScriptLoaded);
      script.removeEventListener('error', onScriptError);
      destroyInstance();
    };
  }, [pathname]);

  return null;
}
