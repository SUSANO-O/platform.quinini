'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { isAppBotIvAWidgetPath, isLandingMarketingPath } from '@/lib/landing-widget-paths';

const SCRIPT_DATA_ATTR = 'biv-platform-sdk';
const BOOT_MAX_TRIES = 20;
const BOOT_DELAY_MS = 120;

type AssistBootResponse = {
  scriptUrl: string;
  config: Record<string, unknown>;
};

function removeAssistDom() {
  document.querySelector('.biv-launcher')?.remove();
  document.querySelector('.afhub-launcher')?.remove();
  document.querySelector('.biv-chat-container')?.remove();
  document.querySelector('.afhub-chat-container')?.remove();
  document.querySelectorAll('[id^="biv_"]').forEach((el) => el.remove());
  document.querySelectorAll('[id^="afhub_"]').forEach((el) => el.remove());
}

/**
 * Asistente interno BotIvA: carga `/assist.js` (bundle distinto al embed público).
 * - marketing → agente math
 * - dashboard → agente math-ais
 */
export function LandingWidgetScript() {
  const pathname = usePathname();
  const timeoutIdsRef = useRef<number[]>([]);
  const instanceRef = useRef<{ destroy?: () => void } | null>(null);
  const bootRef = useRef<AssistBootResponse | null>(null);

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
      removeAssistDom();
      document
        .querySelector<HTMLScriptElement>(`script[data-biv-sdk="${SCRIPT_DATA_ATTR}"]`)
        ?.remove();
      return;
    }

    const context = onLanding ? 'marketing' : 'app';
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

    let bootTries = 0;

    function initWhenReady() {
      if (cancelled || !pathOk()) return;
      if (instanceRef.current || !bootRef.current) return;

      if (window.__BIV && typeof window.__BIV.init === 'function') {
        const api = window.__BIV.init(bootRef.current.config);
        if (api && typeof api === 'object' && 'destroy' in api) {
          instanceRef.current = api as { destroy?: () => void };
        }
        clearPollTimeouts();
        return;
      }

      bootTries += 1;
      if (bootTries >= BOOT_MAX_TRIES) return;
      const id = window.setTimeout(initWhenReady, BOOT_DELAY_MS);
      timeoutIdsRef.current.push(id);
    }

    async function loadAssist() {
      if (cancelled || !pathOk()) return;

      try {
        const res = await fetch(`/api/internal/assist/boot?context=${context}`, {
          credentials: 'same-origin',
        });
        if (!res.ok) return;
        bootRef.current = (await res.json()) as AssistBootResponse;
      } catch {
        return;
      }

      if (cancelled || !bootRef.current) return;

      const scriptSrc = bootRef.current.scriptUrl;
      const existingScript = document.querySelector<HTMLScriptElement>(
        `script[data-biv-sdk="${SCRIPT_DATA_ATTR}"]`,
      );

      const onScriptLoaded = () => {
        if (cancelled) return;
        destroyInstance();
        bootTries = 0;
        clearPollTimeouts();
        initWhenReady();
      };

      const onScriptError = () => {
        /* silencioso en prod */
      };

      if (existingScript) {
        if (existingScript.src !== scriptSrc) {
          existingScript.src = scriptSrc;
        }
        if (window.__BIV) {
          onScriptLoaded();
        } else {
          existingScript.addEventListener('load', onScriptLoaded, { once: true });
          existingScript.addEventListener('error', onScriptError, { once: true });
        }
        return;
      }

      const script = document.createElement('script');
      script.src = scriptSrc;
      script.async = true;
      script.dataset.bivSdk = SCRIPT_DATA_ATTR;
      script.addEventListener('load', onScriptLoaded, { once: true });
      script.addEventListener('error', onScriptError, { once: true });
      document.body.appendChild(script);
    }

    void loadAssist();

    return () => {
      cancelled = true;
      destroyInstance();
    };
  }, [pathname]);

  return null;
}
