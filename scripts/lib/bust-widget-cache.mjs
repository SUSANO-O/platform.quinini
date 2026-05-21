/** Invalida caché wt:* tras updates directos a Mongo (mismo cliente que la landing). */
import { Redis } from '@upstash/redis';

export async function bustWidgetTokenCache(token, widgetId) {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.REDIS_URL;
  const auth = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.REDIS_TOKEN;
  if (!url || !auth || !token?.startsWith('wt_')) return false;
  const redis = new Redis({ url, token: auth });
  await redis.del(`wt:${widgetId ?? token}`);
  if (widgetId) await redis.del(`wt:${token}`);
  return true;
}
