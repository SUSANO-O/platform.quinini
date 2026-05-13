/**
 * Push notifications via Web Push (VAPID).
 * Requiere: npm install web-push @types/web-push
 * Y en .env:
 *   VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 *   VAPID_EMAIL=mailto:admin@yourdomain.com
 */

let webPushModule: typeof import('web-push') | null = null;

async function getWebPush() {
  if (webPushModule) return webPushModule;
  const pk = process.env.VAPID_PUBLIC_KEY;
  const sk = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL;
  if (!pk || !sk || !email) return null;
  try {
    const wp = await import('web-push');
    wp.setVapidDetails(email, pk, sk);
    webPushModule = wp;
    return wp;
  } catch {
    return null;
  }
}

export type PushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<boolean> {
  const wp = await getWebPush();
  if (!wp) return false;
  try {
    await wp.sendNotification(
      subscription as Parameters<typeof wp.sendNotification>[0],
      JSON.stringify(payload),
    );
    return true;
  } catch {
    return false;
  }
}

export async function sendPushToUser(
  pushSubscription: unknown,
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<boolean> {
  if (!pushSubscription || typeof pushSubscription !== 'object') return false;
  return sendPushNotification(pushSubscription as PushSubscription, payload);
}
