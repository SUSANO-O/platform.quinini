'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { Moon, Sun } from '@/components/ui/icons';

export type LandingTheme = 'light' | 'dark';

export const LANDING_THEME_ATTR = 'data-landing-theme';
export const LANDING_THEME_KEY = 'botiva-landing-theme';
const CHANGE_EVENT = 'botiva-landing-theme-change';

function readTheme(): LandingTheme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute(LANDING_THEME_ATTR) === 'light' ? 'light' : 'dark';
}

/**
 * Tema de la landing. El valor real vive en un atributo del `<html>`, que ya
 * quedó puesto por el script del layout antes del primer pintado; acá solo se
 * lee y se cambia. Así el toggle y la barra de navegación se mantienen en
 * sintonía sin duplicar estado.
 */
export function useLandingTheme(): { theme: LandingTheme; toggle: () => void } {
  // Arranca en 'dark' para que servidor y cliente pinten igual; el valor real
  // se lee en cuanto monta (el atributo ya está puesto, no hay parpadeo).
  const [theme, setTheme] = useState<LandingTheme>('dark');

  useEffect(() => {
    setTheme(readTheme());
    const onChange = () => setTheme(readTheme());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const toggle = useCallback(() => {
    const next: LandingTheme = readTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute(LANDING_THEME_ATTR, next);
    try { localStorage.setItem(LANDING_THEME_KEY, next); } catch { /* modo privado */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { theme, toggle };
}

/** Interruptor de tema claro / oscuro. */
export function LandingThemeToggle({ theme, onToggle }: { theme: LandingTheme; onToggle: () => void }) {
  const aOscuro = theme === 'light';
  const etiqueta = aOscuro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';

  return (
    <Tooltip title={etiqueta}>
      <IconButton
        onClick={onToggle}
        size="small"
        aria-label={etiqueta}
        data-testid="landing-theme-toggle"
        sx={{ color: 'inherit', opacity: 0.85, '&:hover': { opacity: 1 } }}
      >
        {aOscuro ? <Moon size={18} /> : <Sun size={18} />}
      </IconButton>
    </Tooltip>
  );
}
