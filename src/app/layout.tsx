import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { AppToasterLoader } from '@/components/ui/app-toaster-loader';
import { LandingWidgetScript } from '@/components/landing/landing-widget-script';
import { CardProTracker } from '@/components/landing/card-pro-tracker';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: `${BRAND_NAME} — AI Agents for Your App`,
  description: 'Integra agentes de IA especializados en tu producto. Chat Widget API, RAG, embeddings y más — una sola API.',
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
  themeColor: '#0f1729',
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
          href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        {/* Captura beforeinstallprompt antes de que React hidrate */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window.__pwaPrompt = e;
          });
        `}} />
        <AuthProvider>
          {children}
          <CardProTracker />
          <LandingWidgetScript />
          <AppToasterLoader />
        </AuthProvider>
      </body>
    </html>
  );
}
