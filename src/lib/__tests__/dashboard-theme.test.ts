import { describe, expect, it } from 'vitest';
import { DASHBOARD_THEME_BOOT_SCRIPT, DASHBOARD_THEME_KEY, parsePreference, resolveTheme } from '@/lib/dashboard-theme';

/** Ejecuta el script previo al pintado con un entorno mínimo y devuelve el data-theme puesto. */
function boot(pathname: string, stored: string | null, systemDark: boolean): string | null {
  const attrs: Record<string, string> = {};
  const env = {
    location: { pathname },
    localStorage: { getItem: (k: string) => (k === DASHBOARD_THEME_KEY ? stored : null) },
    window: { matchMedia: () => ({ matches: systemDark }) },
    document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
  };
  new Function('location', 'localStorage', 'window', 'document', DASHBOARD_THEME_BOOT_SCRIPT)(
    env.location, env.localStorage, env.window, env.document,
  );
  return attrs['data-theme'] ?? null;
}

describe('tema del panel', () => {
  it('preferencia desconocida o vacía = sistema (automático)', () => {
    expect(parsePreference(null)).toBe('system');
    expect(parsePreference('azul')).toBe('system');
    expect(parsePreference('light')).toBe('light');
    expect(parsePreference('dark')).toBe('dark');
    expect(parsePreference('system')).toBe('system');
  });

  it('sistema sigue al equipo', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('el script previo al pintado aplica lo mismo, solo en /dashboard', () => {
    expect(boot('/dashboard', 'dark', false)).toBe('dark');
    expect(boot('/dashboard/agents/1', 'system', true)).toBe('dark');
    expect(boot('/dashboard', null, true)).toBe('dark');
    expect(boot('/dashboard', null, false)).toBe('light');
    expect(boot('/dashboard', 'light', true)).toBe('light');
    expect(boot('/', 'dark', true)).toBeNull();
    expect(boot('/pricing', 'dark', false)).toBeNull();
  });
});
