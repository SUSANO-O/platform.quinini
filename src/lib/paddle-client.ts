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

export function initPaddleClient(): Promise<void> {
  if (_initialized || typeof window === 'undefined') return Promise.resolve();

  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  if (!token) return Promise.resolve();

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.onload = () => {
      try {
        // @ts-expect-error Paddle.js global — sin tipado paquete @paddle/paddle-js requerido
        Paddle.Environment.set(
          process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === 'production'
            ? 'production'
            : 'sandbox',
        );
        // @ts-expect-error Paddle.js global
        Paddle.Initialize({ token });
        _initialized = true;
      } catch {
        // continuar sin Paddle.js si falla la carga
      }
      resolve();
    };
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}
