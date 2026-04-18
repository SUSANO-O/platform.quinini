'use client';

/**
 * Inicializa Paddle.js en el lado del cliente.
 * Equivalente a src/lib/stripe-client.ts (ahora comentado).
 *
 * Variables de entorno requeridas:
 *   NEXT_PUBLIC_PADDLE_CLIENT_TOKEN   — token público (test_... / live_...)
 *   NEXT_PUBLIC_PADDLE_ENVIRONMENT    — "sandbox" | "production"
 */

let _initialized = false;
let _loggedConfig = false;

function maskToken(token: string | undefined): string {
  if (!token) return 'missing';
  if (token.length <= 12) return `${token.slice(0, 4)}...`;
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

export function initPaddleClient(): Promise<void> {
  if (_initialized || typeof window === 'undefined') return Promise.resolve();

  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const env =
    process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === 'production'
      ? 'production'
      : 'sandbox';

  if (!_loggedConfig) {
    _loggedConfig = true;
    console.info('[Paddle][Client] Init config', {
      env,
      token: maskToken(token),
      host: window.location.host,
    });
  }

  if (!token) {
    console.error(
      '[Paddle][Client] NEXT_PUBLIC_PADDLE_CLIENT_TOKEN no está definido. Se omite inicialización.',
    );
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.onload = () => {
      try {
        // @ts-expect-error Paddle.js global — sin tipado paquete @paddle/paddle-js requerido
        Paddle.Environment.set(env);
        // @ts-expect-error Paddle.js global
        Paddle.Initialize({ token });
        _initialized = true;
        console.info('[Paddle][Client] Paddle.Initialize OK', { env });
      } catch {
        // continuar sin Paddle.js si falla la carga
        console.error('[Paddle][Client] Falló Paddle.Initialize');
      }
      resolve();
    };
    script.onerror = () => {
      console.error('[Paddle][Client] Falló carga de https://cdn.paddle.com/paddle/v2/paddle.js');
      resolve();
    };
    document.head.appendChild(script);
  });
}
