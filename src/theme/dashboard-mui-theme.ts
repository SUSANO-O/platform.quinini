'use client';

import { createTheme } from '@mui/material/styles';
import { botivaMuiTheme } from '@/theme/botiva-mui-theme';

/** Tema del panel — botones grises (UX), secundario blanco (sin teal de marca landing). */
export const dashboardMuiTheme = createTheme(botivaMuiTheme, {
  palette: {
    primary: {
      main: '#525252',
      dark: '#404040',
      light: '#737373',
      contrastText: '#ffffff',
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
          backgroundColor: '#525252',
          boxShadow: 'none',
          '&:hover': {
            backgroundColor: '#404040',
            boxShadow: 'none',
          },
          '&:active': {
            backgroundColor: '#363636',
          },
        },
        outlinedPrimary: {
          borderColor: 'rgba(82, 82, 82, 0.22)',
          color: '#525252',
          backgroundColor: '#ffffff',
          '&:hover': {
            backgroundColor: '#f5f5f5',
            borderColor: 'rgba(82, 82, 82, 0.36)',
            boxShadow: 'none',
          },
        },
        textPrimary: {
          color: '#525252',
          '&:hover': {
            backgroundColor: 'rgba(82, 82, 82, 0.08)',
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
          borderColor: 'rgba(82, 82, 82, 0.24)',
          color: '#525252',
          fontWeight: 600,
        },
      },
    },
  },
});
