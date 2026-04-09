import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { AppToaster } from '@/components/ui/app-toaster';

export const metadata: Metadata = {
  title: 'AgentFlow — AI Agents for Your App',
  description: 'Integra agentes de IA especializados en tu producto. Chat widget SDK, RAG, embeddings y más — una sola API.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          {children}
          <AppToaster />
        </AuthProvider>
      </body>
    </html>
  );
}
