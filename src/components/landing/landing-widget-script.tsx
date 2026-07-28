'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { isAppBotIvAWidgetPath, isLandingMarketingPath } from '@/lib/landing-widget-paths';

const SCRIPT_DATA_ATTR = 'biv-platform-sdk';
const BOOT_MAX_TRIES = 20;
const BOOT_DELAY_MS = 120;

type AssistBootResponse = {
  scriptUrl: string;
  config: Record<string, unknown>;
};

type AssistContext = 'app' | 'marketing' | null;

type PendingNav = {
  target: string;
  hash: string;
  resolve: (ok: boolean) => void;
};

function normalizeNavPath(path: string): string {
  return path.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
}

function stripLocalePrefix(path: string): string {
  return path.replace(/^\/(es|en)(?=\/)/, '') || '/';
}

function navPathsMatch(target: string, current: string): boolean {
  return (
    normalizeNavPath(stripLocalePrefix(target)) ===
    normalizeNavPath(stripLocalePrefix(current))
  );
}

function splitNavTarget(raw: string): { path: string; hash: string } {
  const trimmed = String(raw || '').trim();
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx === -1) {
    return { path: trimmed, hash: '' };
  }
  return {
    path: trimmed.slice(0, hashIdx) || '/dashboard',
    hash: trimmed.slice(hashIdx + 1).trim(),
  };
}

function scrollToNavHash(hash: string) {
  if (!hash) return;
  window.setTimeout(() => {
    try {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      /* noop */
    }
  }, 200);
}

function resolveAssistContext(pathname: string | null): AssistContext {
  if (isLandingMarketingPath(pathname)) return 'marketing';
  if (isAppBotIvAWidgetPath(pathname)) return 'app';
  return null;
}

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
 *
 * No destruye el widget al navegar entre páginas del mismo contexto (p. ej. /dashboard → /dashboard/inbox).
 */
export function LandingWidgetScript() {
  const pathname = usePathname();
  const router = useRouter();
  const context = resolveAssistContext(pathname);
  const timeoutIdsRef = useRef<number[]>([]);
  const instanceRef = useRef<{ destroy?: () => void } | null>(null);
  const bootRef = useRef<AssistBootResponse | null>(null);
  const activeContextRef = useRef<AssistContext>(null);
  const pathnameRef = useRef(pathname);
  const pendingNavRef = useRef<PendingNav | null>(null);
  const navigateRef = useRef<(path: string) => Promise<boolean>>(async () => false);

  pathnameRef.current = pathname;

  const runNavigate = useCallback(
    (rawPath: string): Promise<boolean> => {
      const { path, hash } = splitNavTarget(rawPath);
      const target = path.trim();
      if (!target) return Promise.resolve(false);

      window.dispatchEvent(
        new CustomEvent('biv:navigate-start', { detail: { path: target } }),
      );

      const current = pathnameRef.current || '';
      if (navPathsMatch(target, current)) {
        scrollToNavHash(hash);
        window.dispatchEvent(
          new CustomEvent('biv:navigate-done', { detail: { path: current } }),
        );
        return Promise.resolve(true);
      }

      return new Promise<boolean>((resolve) => {
        pendingNavRef.current = { target, hash, resolve };
        router.push(target);
      });
    },
    [router],
  );

  navigateRef.current = runNavigate;

  const bindAssistNavigate = useCallback(() => {
    window.__BIV = window.__BIV ?? {};
    window.__BIV.navigate = (path: string) => navigateRef.current(path);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const clearPollTimeouts = () => {
      timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutIdsRef.current = [];
    };

    const destroyInstance = () => {
      clearPollTimeouts();
      try {
        instanceRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      instanceRef.current = null;
    };

    if (!context) {
      destroyInstance();
      bootRef.current = null;
      activeContextRef.current = null;
      removeAssistDom();
      document
        .querySelector<HTMLScriptElement>(`script[data-biv-sdk="${SCRIPT_DATA_ATTR}"]`)
        ?.remove();
      return;
    }

    let cancelled = false;
    let bootTries = 0;

    function initWhenReady() {
      if (cancelled || !bootRef.current || resolveAssistContext(window.location.pathname) !== context) return;
      if (instanceRef.current) return;

      if (window.__BIV && typeof window.__BIV.init === 'function') {
        const api = window.__BIV.init(bootRef.current.config);
        if (api && typeof api === 'object' && 'destroy' in api) {
          instanceRef.current = api as { destroy?: () => void };
        }
        bindAssistNavigate();
        clearPollTimeouts();
        return;
      }

      bootTries += 1;
      if (bootTries >= BOOT_MAX_TRIES) return;
      const id = window.setTimeout(initWhenReady, BOOT_DELAY_MS);
      timeoutIdsRef.current.push(id);
    }

    async function loadAssist() {
      if (cancelled || resolveAssistContext(window.location.pathname) !== context) return;

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
        if (resolveAssistContext(window.location.pathname) !== context) return;
        if (!instanceRef.current) {
          bootTries = 0;
          clearPollTimeouts();
          initWhenReady();
          return;
        }
        bindAssistNavigate();
      };

      const onScriptError = () => {
        /* silencioso en prod */
      };

      if (existingScript) {
        if (existingScript.src !== scriptSrc) {
          destroyInstance();
          removeAssistDom();
          try {
            delete (window as unknown as Record<string, unknown>).__BIV;
          } catch {
            /* noop */
          }
          existingScript.src = scriptSrc;
          existingScript.addEventListener('load', onScriptLoaded, { once: true });
          existingScript.addEventListener('error', onScriptError, { once: true });
          return;
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

    const sameContext = activeContextRef.current === context && instanceRef.current;
    activeContextRef.current = context;

    if (sameContext) {
      return () => {
        cancelled = true;
      };
    }

    destroyInstance();
    void loadAssist();

    return () => {
      cancelled = true;
      if (resolveAssistContext(window.location.pathname) !== context) {
        destroyInstance();
      }
    };
  }, [bindAssistNavigate, context]);

  // Navegación SPA para Math-ais (Sí → redirigir sin recargar la burbuja).
  useEffect(() => {
    if (context !== 'app') return;

    bindAssistNavigate();

    const onNavigateRequest = (ev: Event) => {
      const detail = (ev as CustomEvent<{ path?: string }>).detail;
      const path = detail?.path;
      if (!path) return;
      void runNavigate(path);
    };

    const onAssistReady = () => {
      bindAssistNavigate();
    };

    window.addEventListener('biv:navigate-request', onNavigateRequest);
    window.addEventListener('biv:assist-ready', onAssistReady);

    return () => {
      window.removeEventListener('biv:navigate-request', onNavigateRequest);
      window.removeEventListener('biv:assist-ready', onAssistReady);
      pendingNavRef.current?.resolve(false);
      pendingNavRef.current = null;
    };
  }, [bindAssistNavigate, context, runNavigate]);

  // Actualizar pagePath al navegar dentro del dashboard (sin reiniciar la burbuja).
  useEffect(() => {
    if (!context || !pathname) return;
    try {
      window.__BIV?.updatePagePath?.(pathname);
    } catch {
      /* noop */
    }

    const pending = pendingNavRef.current;
    if (pending && navPathsMatch(pending.target, pathname)) {
      pending.resolve(true);
      pendingNavRef.current = null;
      scrollToNavHash(pending.hash);
      window.dispatchEvent(
        new CustomEvent('biv:navigate-done', { detail: { path: pathname } }),
      );
    }
  }, [pathname, context]);

  return null;
}
