'use client';

import { useCallback, useEffect, useState } from 'react';

const POLL_MS = 30_000;

export function useInboxOpenCount(enabled = true) {
  const [openCount, setOpenCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch('/api/inbox/count', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { openCount?: number };
      setOpenCount(typeof data.openCount === 'number' ? data.openCount : 0);
    } catch {
      /* noop */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setOpenCount(0);
      return;
    }
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    const onInboxChanged = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('afhub:inbox-changed', onInboxChanged);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('afhub:inbox-changed', onInboxChanged);
    };
  }, [enabled, refresh]);

  return { openCount, refresh };
}

/** Notifica al sidebar (y otros listeners) que el inbox cambió. */
export function notifyInboxChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('afhub:inbox-changed'));
  }
}
