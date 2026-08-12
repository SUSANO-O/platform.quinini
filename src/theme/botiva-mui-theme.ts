'use client';

import { createTheme } from '@mui/material/styles';
import { BRAND } from '@/lib/brand-colors';

/**
 * Material UI v7 — tema BotIvA (Material Design + marca Cognitive Nexus).
 */
export const botivaMuiTheme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'light',
    primary: {
      main: BRAND.primary,
      dark: BRAND.primaryDark,
      light: BRAND.primaryLight,
      contrastText: '#ffffff',
    },
    secondary: {
      main: BRAND.tertiary,
      contrastText: '#ffffff',
    },
    background: {
      default: '#f4f7f8',
      paper: '#ffffff',
    },
    text: {
      primary: BRAND.neutral,
      secondary: 'rgba(26,28,30,0.68)',
    },
    divider: 'rgba(26,28,30,0.1)',
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Plus Jakarta Sans", "Outfit", system-ui, sans-serif',
    htmlFontSize: 16,
    fontSize: 15,
    fontWeightLight: 400,
    fontWeightRegular: 500,
    fontWeightMedium: 600,
    fontWeightBold: 700,
    h1: {
      fontFamily: '"Outfit", "Plus Jakarta Sans", system-ui, sans-serif',
      fontWeight: 800,
      fontSize: 'clamp(2.5rem, 6vw, 3.75rem)',
      lineHeight: 1.05,
      letterSpacing: '-0.04em',
    },
    h2: {
      fontFamily: '"Outfit", "Plus Jakarta Sans", system-ui, sans-serif',
      fontWeight: 700,
      fontSize: 'clamp(1.75rem, 3.5vw, 2.35rem)',
      lineHeight: 1.15,
      letterSpacing: '-0.03em',
    },
    h3: {
      fontFamily: '"Outfit", "Plus Jakarta Sans", system-ui, sans-serif',
      fontWeight: 700,
      fontSize: 'clamp(1.35rem, 2.4vw, 1.75rem)',
      lineHeight: 1.2,
      letterSpacing: '-0.025em',
    },
    h4: {
      fontFamily: '"Outfit", "Plus Jakarta Sans", system-ui, sans-serif',
      fontWeight: 700,
      fontSize: '1.35rem',
      lineHeight: 1.25,
      letterSpacing: '-0.02em',
    },
    h5: {
      fontFamily: '"Outfit", "Plus Jakarta Sans", system-ui, sans-serif',
      fontWeight: 600,
      fontSize: '1.15rem',
      lineHeight: 1.3,
      letterSpacing: '-0.02em',
    },
    h6: {
      fontFamily: '"Outfit", "Plus Jakarta Sans", system-ui, sans-serif',
      fontWeight: 600,
      fontSize: '1rem',
      lineHeight: 1.35,
      letterSpacing: '-0.015em',
    },
    subtitle1: {
      fontFamily: '"Plus Jakarta Sans", "Outfit", system-ui, sans-serif',
      fontWeight: 600,
      fontSize: '1.05rem',
      lineHeight: 1.45,
      letterSpacing: '-0.015em',
    },
    subtitle2: {
      fontFamily: '"Plus Jakarta Sans", "Outfit", system-ui, sans-serif',
      fontWeight: 600,
      fontSize: '0.925rem',
      lineHeight: 1.4,
      letterSpacing: '-0.01em',
    },
    body1: {
      fontFamily: '"Plus Jakarta Sans", "Outfit", system-ui, sans-serif',
      fontWeight: 500,
      fontSize: '1rem',
      lineHeight: 1.65,
      letterSpacing: '-0.011em',
    },
    body2: {
      fontFamily: '"Plus Jakarta Sans", "Outfit", system-ui, sans-serif',
      fontWeight: 500,
      fontSize: '0.925rem',
      lineHeight: 1.6,
      letterSpacing: '-0.01em',
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
      fontSize: '0.9375rem',
      letterSpacing: '-0.01em',
      fontFamily: '"Plus Jakarta Sans", "Outfit", system-ui, sans-serif',
    },
    caption: {
      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      fontWeight: 500,
      fontSize: '0.78rem',
      lineHeight: 1.45,
      letterSpacing: '0.01em',
    },
    overline: {
      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      fontWeight: 700,
      fontSize: '0.7rem',
      lineHeight: 1.4,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#f4f7f8',
          fontFamily: '"Plus Jakarta Sans", "Outfit", system-ui, sans-serif',
          fontSize: '1rem',
          lineHeight: 1.65,
          letterSpacing: '-0.011em',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
          fontFeatureSettings: '"ss01" on, "cv11" on',
        },
        'h1, h2, h3, h4, h5, h6': {
          textWrap: 'balance',
        },
        p: {
          textWrap: 'pretty',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 12,
          paddingInline: 18,
          paddingBlock: 10,
        },
        containedPrimary: {
          boxShadow: '0 6px 20px rgba(0,107,125,0.22)',
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 18,
          border: '1px solid rgba(26,28,30,0.08)',
          boxShadow: '0 10px 36px rgba(15,23,42,0.06)',
        },
      },
    },
    MuiAppBar: {
      defaultProps: { color: 'inherit', elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(26,28,30,0.08)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 18 },
      },
    },
  },
});
