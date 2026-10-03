/**
 * Tema del panel (Claro / Oscuro / Sistema): constantes y lógica pura, sin React, para que la use
 * también el layout raíz (componente de servidor) en el script previo al pintado.
 * El estado y el interruptor viven en src/hooks/use-dashboard-theme.tsx.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const DASHBOARD_THEME_KEY = 'botiva-theme';

/** Mismo cálculo que el script previo al pintado (mantener los dos iguales). */
export const DASHBOARD_THEME_BOOT_SCRIPT = `(function(){try{if(location.pathname.indexOf('/dashboard')!==0)return;var p=localStorage.getItem('${DASHBOARD_THEME_KEY}');var d=p==='dark'||(p!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;

/** Sin preferencia guardada (o desconocida) = Sistema: el panel sigue al tema del equipo. */
export function parsePreference(v: unknown): ThemePreference {
  return v === 'dark' || v === 'light' ? v : 'system';
}

export function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  return pref === 'dark' || (pref === 'system' && systemDark) ? 'dark' : 'light';
}
