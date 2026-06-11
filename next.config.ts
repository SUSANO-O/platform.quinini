import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';
// @ts-ignore -- next-pwa still ships loose typings
import withPWAInit from 'next-pwa';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  customWorkerDir: 'worker',
  // El SW nunca intercepta API routes, auth ni Cloudflare — van siempre a la red
  publicExcludes: ['!/api/**', '!/widget/**'],
});

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  serverExternalPackages: [
    'mongoose', 'stripe', 'bcryptjs', 'pdf-parse', 'mammoth',
    'puppeteer-core', '@sparticuz/chromium', 'jsdom', '@mozilla/readability',
    'speakeasy', 'qrcode',
  ],

  async redirects() {
    return [
      { source: '/favicon.ico', destination: '/favicon.svg', permanent: false },
      { source: '/docs', destination: '/pricing#api', permanent: false },
      { source: '/playground', destination: '/pricing#api', permanent: false },
    ];
  },

  async headers() {
    // Origen del servicio agent-flow-api (documentación embebida en iframe)
    const agentflowApiOrigin = (() => {
      const raw = process.env.NEXT_PUBLIC_AGENTFLOW_API_URL?.trim() || 'http://127.0.0.1:4000';
      try { return new URL(raw).origin; } catch { return 'http://127.0.0.1:4000'; }
    })();

    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=self, geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://control-BotIvA.vercel.app https://unpkg.com https://challenges.cloudflare.com",
              "script-src-elem 'self' 'unsafe-inline' https://control-BotIvA.vercel.app https://unpkg.com https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com https://unpkg.com",
              "font-src 'self' data: https://fonts.gstatic.com https://api.fontshare.com https://cdn.fontshare.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://api.lemonsqueezy.com https://api.stripe.com https://*.upstash.io https://control-BotIvA.vercel.app https://challenges.cloudflare.com wss:",
              `frame-src https://app.lemonsqueezy.com https://checkout.lemonsqueezy.com https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com ${agentflowApiOrigin}`,
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://checkout.lemonsqueezy.com https://billing.stripe.com",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
      {
        // Allow Widget API to be embedded in iframes on any origin
        source: '/widget/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
        ],
      },
    ];
  },
};

export default withPWA(withNextIntl(nextConfig));
