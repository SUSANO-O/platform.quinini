'use client';

import { createTheme } from '@mui/material/styles';
import { botivaMuiTheme } from '@/theme/botiva-mui-theme';

/** Tema del panel — botones outline B/N, cajas sin borde (sin teal landing). */
export const dashboardMuiTheme = createTheme(botivaMuiTheme, {
  palette: {
    primary: {
      main: '#111111',
      dark: '#000000',
      light: '#525252',
      contrastText: '#111111',
    },
    secondary: {
      main: '#ffffff',
      dark: '#f5f5f5',
      light: '#ffffff',
      contrastText: '#111111',
    },
  },
  components: {
    // Colores vía variables de globals.css: así siguen al tema claro/oscuro del panel.
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: 'var(--background)', color: 'var(--foreground)' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { backgroundColor: 'var(--card)', borderColor: 'var(--border)' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingInline: 20,
          paddingBlock: 10,
          fontSize: '0.875rem',
          fontWeight: 600,
          letterSpacing: '-0.012em',
          textTransform: 'none',
          minHeight: 40,
          lineHeight: 1.25,
          boxShadow: 'none',
          transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
        },
        sizeSmall: {
          paddingInline: 16,
          paddingBlock: 8,
          fontSize: '0.8125rem',
          minHeight: 36,
        },
        containedPrimary: {
          backgroundColor: 'var(--card)',
          color: 'var(--foreground)',
          border: '1px solid var(--foreground)',
          boxShadow: 'none',
          '&:hover': {
            backgroundColor: 'var(--muted)',
            borderColor: 'var(--foreground)',
            boxShadow: '0 2px 12px color-mix(in srgb, var(--foreground) 7%, transparent)',
          },
          '&:active': {
            backgroundColor: 'color-mix(in srgb, var(--foreground) 10%, transparent)',
          },
        },
        outlinedPrimary: {
          borderColor: 'var(--foreground)',
          color: 'var(--foreground)',
          backgroundColor: 'var(--card)',
          '&:hover': {
            backgroundColor: 'var(--muted)',
            borderColor: 'var(--foreground)',
            boxShadow: '0 2px 12px color-mix(in srgb, var(--foreground) 7%, transparent)',
          },
        },
        textPrimary: {
          color: 'var(--foreground)',
          '&:hover': {
            backgroundColor: 'color-mix(in srgb, var(--foreground) 5%, transparent)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          transition: 'background-color 0.2s ease',
          '&:hover': {
            backgroundColor: 'color-mix(in srgb, var(--foreground) 6%, transparent)',
          },
        },
        sizeSmall: {
          padding: 8,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        outlinedPrimary: {
          borderColor: 'color-mix(in srgb, var(--foreground) 20%, transparent)',
          color: 'var(--foreground)',
          fontWeight: 600,
        },
      },
    },
  },
});

/** Variante oscura: la paleta (texto, superficies, divisores) que MUI usa por dentro. */
export const dashboardMuiThemeDark = createTheme(dashboardMuiTheme, {
  palette: {
    mode: 'dark',
    primary: { main: '#e9ecf2', dark: '#ffffff', light: '#c7ccd6', contrastText: '#0c0e13' },
    secondary: { main: '#151921', dark: '#0c0e13', light: '#1d222b', contrastText: '#e9ecf2' },
    background: { default: '#0c0e13', paper: '#151921' },
    text: { primary: '#e9ecf2', secondary: 'rgba(233,236,242,0.68)', disabled: 'rgba(233,236,242,0.38)' },
    divider: 'rgba(255,255,255,0.1)',
    action: { hover: 'rgba(255,255,255,0.06)', selected: 'rgba(255,255,255,0.1)' },
  },
});
