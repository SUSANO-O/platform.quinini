import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { AppToasterLoader } from '@/components/ui/app-toaster-loader';
import { LandingWidgetScript } from '@/components/landing/landing-widget-script';

export const metadata: Metadata = {
  title: 'MatIAs— AI Agents for Your App',
  description: 'Integra agentes de IA especializados en tu producto. Chat Widget API, RAG, embeddings y más — una sola API.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/t1.png', sizes: '192x192', type: 'image/png' },
      { url: '/t1.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/t1.png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MatIAs',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0f1729',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/t1.png" sizes="192x192" type="image/png" />
        <link rel="apple-touch-icon" href="/t1.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          {children}
          <LandingWidgetScript />
          <AppToasterLoader />
        </AuthProvider>
      </body>
    </html>
  );
}
