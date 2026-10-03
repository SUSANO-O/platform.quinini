'use client';

/**
 * Tema del panel: Claro / Oscuro / Sistema. Guarda la preferencia en este navegador y pone
 * html[data-theme="light"|"dark"] mientras estás en /dashboard (al salir lo quita: la landing tiene
 * su propio tema, data-landing-theme). El script de src/app/layout.tsx aplica lo mismo antes del
 * primer pintado para que no parpadee. Las variables de cada tema están en globals.css.
 */

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DASHBOARD_THEME_KEY, parsePreference, resolveTheme, type ResolvedTheme, type ThemePreference } from '@/lib/dashboard-theme';

export type { ResolvedTheme, ThemePreference };

type Ctx = { preference: ThemePreference; resolved: ResolvedTheme; setPreference: (p: ThemePreference) => void };

const DashboardThemeContext = createContext<Ctx>({ preference: 'light', resolved: 'light', setPreference: () => {} });

function readPreference(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(DASHBOARD_THEME_KEY));
  } catch {
    return 'light';
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function DashboardThemeProvider({ children }: { children: ReactNode }) {
  // Primer render igual en servidor y cliente; el valor real llega en el efecto (el script previo
  // ya pintó el atributo correcto, así que no hay parpadeo).
  const [preference, setPref] = useState<ThemePreference>('light');
  const [systemDark, setSystemDark] = useState(false);
  /** Hasta leer la preferencia guardada no se toca el atributo (lo puso el script previo). */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPref(readPreference());
    setSystemDark(systemPrefersDark());
    setReady(true);
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(preference, systemDark);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.setAttribute('data-theme', resolved);
  }, [ready, resolved]);

  // Al salir del panel (desmontaje) se quita: la landing no usa este tema.
  useEffect(() => () => document.documentElement.removeAttribute('data-theme'), []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    try {
      localStorage.setItem(DASHBOARD_THEME_KEY, p);
    } catch {
      /* noop */
    }
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <DashboardThemeContext.Provider value={value}>{children}</DashboardThemeContext.Provider>;
}

export function useDashboardTheme(): Ctx {
  return useContext(DashboardThemeContext);
}
