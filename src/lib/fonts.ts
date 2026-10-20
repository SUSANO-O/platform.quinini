import { Geist, Geist_Mono } from 'next/font/google';

/**
 * Tipografía única de la plataforma: Geist para todo (títulos, texto, botones) y Geist Mono
 * para código e IDs. next/font inyecta métricas de fallback (size-adjust) → evita salto al cargar.
 */
export const fontGeist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
  adjustFontFallback: true,
});

export const fontGeistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
  adjustFontFallback: true,
});

export const appFontVariables = [fontGeist.variable, fontGeistMono.variable].join(' ');
