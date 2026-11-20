'use client';

/**
 * Recarga la página UNA vez ante un `ChunkLoadError` (chunk JS/CSS que no cargó).
 *
 * En Cloud Run con escalado a 0, el primer acceso en frío dispara muchos chunks en paralelo contra
 * una instancia fría; algunos pueden devolver 429 → `ChunkLoadError` → la pantalla se cae. Al recargar,
 * la instancia ya está caliente y cargan bien. La guarda de 15s evita bucles de recarga.
 */

import { useEffect } from 'react';

const GUARD_KEY = 'chunk-reload-at';
const GUARD_MS = 15_000;

function isChunkError(msg: string): boolean {
  return /ChunkLoadError|Loading chunk \d|Loading CSS chunk|error loading dynamically imported module/i.test(msg);
}

export default function ChunkErrorReload() {
  useEffect(() => {
    const handle = (msg: string) => {
      if (!isChunkError(msg)) return;
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(GUARD_KEY) || 0);
      } catch {
        /* sessionStorage no disponible */
      }
      if (Date.now() - last < GUARD_MS) return; // ya recargamos hace poco → no insistir
      try {
        sessionStorage.setItem(GUARD_KEY, String(Date.now()));
      } catch {
        /* no-op */
      }
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => handle(String(e?.error?.message || e?.message || ''));
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e?.reason as { message?: string; name?: string } | undefined;
      handle(String(r?.message || r?.name || ''));
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
