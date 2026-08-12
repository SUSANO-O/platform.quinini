import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { AppToasterLoader } from '@/components/ui/app-toaster-loader';
import { LandingWidgetScript } from '@/components/landing/landing-widget-script';
import { CardProTracker } from '@/components/landing/card-pro-tracker';
import { MuiProvider } from '@/providers/mui-provider';
import { BRAND_FAVICON_SRC, BRAND_LOGO_PNG_SRC, BRAND_NAME } from '@/lib/brand';
import { appFontVariables } from '@/lib/fonts';

/** Evita SSG en rutas que dependen de providers cliente (auth, toasts, assist). */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${BRAND_NAME} — AI Agents for Your App`,
  description: 'Integra agentes de IA especializados en tu producto. Chat Widget API, almacenamiento, embeddings y más — una sola API.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: BRAND_FAVICON_SRC, sizes: '32x32', type: 'image/png' },
      { url: BRAND_LOGO_PNG_SRC, sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: BRAND_LOGO_PNG_SRC, sizes: '512x512' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: BRAND_NAME,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#006B7D',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={appFontVariables} suppressHydrationWarning>
      <head>
        <link rel="icon" href={BRAND_FAVICON_SRC} type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href={BRAND_LOGO_PNG_SRC} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Solo iconos: tipografía vía next/font (sin salto de layout). */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window.__pwaPrompt = e;
          });
        `,
          }}
        />
        <MuiProvider>
          <AuthProvider>
            {children}
            <CardProTracker />
            <LandingWidgetScript />
            <AppToasterLoader />
          </AuthProvider>
        </MuiProvider>
      </body>
    </html>
  );
}
