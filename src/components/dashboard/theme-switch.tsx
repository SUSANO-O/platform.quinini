'use client';

/** Selector de tema del panel: Claro / Oscuro / Sistema (ver src/hooks/use-dashboard-theme.tsx). */

import { Monitor, Moon, Sun } from '@/components/ui/icons';
import { useDashboardTheme, type ThemePreference } from '@/hooks/use-dashboard-theme';

export const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

export function ThemeSwitch({ className = '' }: { className?: string }) {
  const { preference, setPreference } = useDashboardTheme();
  return (
    <div className={`theme-switch ${className}`} role="radiogroup" aria-label="Tema del panel">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          className={preference === value ? 'is-on' : ''}
          onClick={() => setPreference(value)}
        >
          <Icon size={15} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Botón compacto (riel): pasa Claro → Oscuro → Sistema. */
export function ThemeCycleButton({ className = '' }: { className?: string }) {
  const { preference, setPreference } = useDashboardTheme();
  const i = THEME_OPTIONS.findIndex((o) => o.value === preference);
  const current = THEME_OPTIONS[i] ?? THEME_OPTIONS[0];
  const next = THEME_OPTIONS[(i + 1) % THEME_OPTIONS.length];
  const Icon = current.icon;
  return (
    <button type="button" className={className} title={`Tema: ${current.label} (cambiar a ${next.label})`} onClick={() => setPreference(next.value)}>
      <Icon size={17} aria-hidden />
    </button>
  );
}
