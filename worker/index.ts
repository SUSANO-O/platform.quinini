/// <reference lib="webworker" />

/**
 * Worker custom para next-pwa:
 * - Enfoca/abre la app al hacer click en notificaciones push.
 * - Mantiene compatibilidad con las rutas existentes sin cachear lógica sensible.
 */
const sw = self as unknown as {
  registration: { showNotification(title: string, options?: NotificationOptions): Promise<void> };
  clients: {
    matchAll(options?: unknown): Promise<Array<{ url: string; focus?: () => Promise<unknown> }>>;
    openWindow(url: string): Promise<unknown>;
  };
  location: { origin: string };
  addEventListener: (type: string, listener: (event: Event) => void) => void;
};

sw.addEventListener('push', (event) => {
  const pushEvent = event as Event & {
    waitUntil(promise: Promise<unknown>): void;
    data?: { json(): unknown; text(): string };
  };
  const fallback = {
    title: 'MatIAs',
    body: 'Tienes una nueva notificación.',
  };

  let payload = fallback;
  try {
    if (pushEvent.data) {
      const parsed = pushEvent.data.json() as Record<string, unknown>;
      payload = {
        title: typeof parsed.title === 'string' ? parsed.title : fallback.title,
        body: typeof parsed.body === 'string' ? parsed.body : fallback.body,
      };
    }
  } catch {
    if (pushEvent.data) payload = { ...fallback, body: pushEvent.data.text() };
  }

  pushEvent.waitUntil(
    sw.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/t1.png',
      badge: '/t1.png',
    }),
  );
});

sw.addEventListener('notificationclick', (event) => {
  const clickEvent = event as Event & {
    notification: { close(): void };
    waitUntil(promise: Promise<unknown>): void;
  };
  clickEvent.notification.close();

  clickEvent.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(sw.location.origin) && typeof client.focus === 'function') {
          return client.focus();
        }
      }
      return sw.clients.openWindow('/');
    }),
  );
});
