import { Geist, Geist_Mono, Inter, JetBrains_Mono, Merriweather, Newsreader, Outfit, Plus_Jakarta_Sans } from 'next/font/google';

/** next/font inyecta métricas de fallback (size-adjust) → evita salto al cargar. */
export const fontInter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  adjustFontFallback: true,
});

export const fontMerriweather = Merriweather({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-merriweather',
  display: 'swap',
  adjustFontFallback: true,
});

export const fontOutfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-outfit',
  display: 'swap',
  adjustFontFallback: true,
});

export const fontPlusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-plus-jakarta',
  display: 'swap',
  adjustFontFallback: true,
});

export const fontJetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
  display: 'swap',
  adjustFontFallback: true,
});

/** Tipografía global: Geist (texto), Newsreader (títulos, serif editorial con tamaño óptico), Geist Mono. */
export const fontGeist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
  adjustFontFallback: true,
});

export const fontNewsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-newsreader',
  display: 'swap',
  adjustFontFallback: true,
});

export const fontGeistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
  adjustFontFallback: true,
});

export const appFontVariables = [
  fontGeist.variable,
  fontNewsreader.variable,
  fontGeistMono.variable,
  fontInter.variable,
  fontMerriweather.variable,
  fontOutfit.variable,
  fontPlusJakarta.variable,
  fontJetbrainsMono.variable,
].join(' ');
