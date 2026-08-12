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
          backgroundColor: '#ffffff',
          color: '#111111',
          border: '1px solid #111111',
          boxShadow: 'none',
          '&:hover': {
            backgroundColor: '#f4f4f5',
            borderColor: '#111111',
            boxShadow: '0 2px 12px rgba(17, 17, 17, 0.07)',
          },
          '&:active': {
            backgroundColor: '#ececec',
          },
        },
        outlinedPrimary: {
          borderColor: '#111111',
          color: '#111111',
          backgroundColor: '#ffffff',
          '&:hover': {
            backgroundColor: '#f4f4f5',
            borderColor: '#111111',
            boxShadow: '0 2px 12px rgba(17, 17, 17, 0.07)',
          },
        },
        textPrimary: {
          color: '#111111',
          '&:hover': {
            backgroundColor: 'rgba(17, 17, 17, 0.05)',
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
            backgroundColor: 'rgba(17, 17, 17, 0.06)',
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
          borderColor: 'rgba(17, 17, 17, 0.2)',
          color: '#111111',
          fontWeight: 600,
        },
      },
    },
  },
});
