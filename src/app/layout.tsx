import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { AppToasterLoader } from '@/components/ui/app-toaster-loader';
import { LandingWidgetScript } from '@/components/landing/landing-widget-script';
import { CardProTracker } from '@/components/landing/card-pro-tracker';
import { MuiProvider } from '@/providers/mui-provider';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';

/** Evita SSG en rutas que dependen de providers cliente (auth, toasts, assist). */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${BRAND_NAME} — AI Agents for Your App`,
  description: 'Integra agentes de IA especializados en tu producto. Chat Widget API, almacenamiento, embeddings y más — una sola API.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: BRAND_LOGO_SRC, sizes: '192x192', type: 'image/png' },
      { url: BRAND_LOGO_SRC, sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: BRAND_LOGO_SRC }],
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
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="icon" href={BRAND_LOGO_SRC} sizes="192x192" type="image/png" />
        <link rel="apple-touch-icon" href={BRAND_LOGO_SRC} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
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
