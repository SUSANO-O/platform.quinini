'use client';

import { useEffect, useState } from 'react';

/** Mantiene el splash visible `extraMs` después de que `loading` pase a false. */
export function useAuthSplashLoading(loading: boolean, extraMs = 2000) {
  const [hold, setHold] = useState(true);

  useEffect(() => {
    if (loading) {
      setHold(true);
      return;
    }
    const t = window.setTimeout(() => setHold(false), extraMs);
    return () => window.clearTimeout(t);
  }, [loading, extraMs]);

  return loading || hold;
}
