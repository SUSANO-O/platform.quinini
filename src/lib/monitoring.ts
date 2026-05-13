/**
 * Monitoring — error tracking centralizado.
 *
 * Usa Sentry si NEXT_PUBLIC_SENTRY_DSN está definido; sino logea en consola.
 *
 * Setup:
 *   npm install @sentry/nextjs
 *   Agregar al .env:
 *     NEXT_PUBLIC_SENTRY_DSN=https://xxx@o0.ingest.sentry.io/xxx
 *     SENTRY_ORG=tu-org
 *     SENTRY_PROJECT=agent-flow-landing
 */

let Sentry: typeof import('@sentry/nextjs') | null = null;

async function getSentry() {
  if (Sentry) return Sentry;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return null;
  try {
    Sentry = await import('@sentry/nextjs');
    return Sentry;
  } catch {
    return null;
  }
}

export async function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const s = await getSentry();
  if (s) {
    s.withScope((scope) => {
      if (context) scope.setExtras(context);
      s.captureException(error);
    });
  } else {
    console.error('[monitoring]', error, context ?? '');
  }
}

export async function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>,
): Promise<void> {
  const s = await getSentry();
  if (s) {
    s.withScope((scope) => {
      if (context) scope.setExtras(context);
      s.captureMessage(message, level);
    });
  } else {
    console[level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'info'](
      `[monitoring] ${message}`,
      context ?? '',
    );
  }
}

export function initSentryEdge() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  import('@sentry/nextjs').then((s) => {
    s.init({
      dsn,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    });
  }).catch(() => {});
}
