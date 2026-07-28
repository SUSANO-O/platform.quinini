import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';
// @ts-ignore -- next-pwa still ships loose typings
import withPWAInit from 'next-pwa';
import { getAgentflowApiOriginsForCsp } from './src/lib/agentflow-api-url';
import { AGENTFLOW_API_EMBED_CSP } from './src/lib/agentflow-api-embed-csp';

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
    const agentflowApiOrigins = getAgentflowApiOriginsForCsp().join(' ');
    const isProduction = process.env.NODE_ENV === 'production';

    const globalSecurityHeaders = [
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=self, geolocation=()' },
    ];

    if (isProduction) {
      globalSecurityHeaders.unshift({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }

    const globalCspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://control-BotIvA.vercel.app https://unpkg.com https://challenges.cloudflare.com",
      "script-src-elem 'self' 'unsafe-inline' https://control-BotIvA.vercel.app https://unpkg.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com https://unpkg.com",
      "font-src 'self' data: https://fonts.gstatic.com https://api.fontshare.com https://cdn.fontshare.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://api.lemonsqueezy.com https://api.stripe.com https://*.upstash.io https://control-BotIvA.vercel.app https://challenges.cloudflare.com wss: " + agentflowApiOrigins,
      // 'self' incluye /api/embed/afapi/* (docs embebidas en /dashboard/api)
      `frame-src 'self' https://app.lemonsqueezy.com https://checkout.lemonsqueezy.com https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com ${agentflowApiOrigins}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.lemonsqueezy.com https://billing.stripe.com",
    ];

    // En local HTTP, upgrade-insecure-requests rompe iframes same-origin (http→https).
    if (isProduction) {
      globalCspDirectives.push('upgrade-insecure-requests');
    }

    globalSecurityHeaders.push({
      key: 'Content-Security-Policy',
      value: globalCspDirectives.join('; '),
    });

    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: globalSecurityHeaders,
      },
      {
        // Allow Widget API to be embedded in iframes on any origin
        source: '/widget/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
        ],
      },
      {
        // Scalar docs embebidas en /dashboard/api (cdn.jsdelivr.net + iframe same-origin)
        source: '/api/embed/afapi/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: AGENTFLOW_API_EMBED_CSP },
        ],
      },
      {
        // SDK embebible: evitar caché agresiva tras deploy (estilos/CSS inyectado en JS)
        source: '/widget.js',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/assist.js',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },
};

export default withPWA(withNextIntl(nextConfig));
