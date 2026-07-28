import type { MeteringChannel } from './types';

/** Peso base por canal antes de promos/descuentos. */
export const METERING_CHANNEL_BASE_UNITS: Record<MeteringChannel, number> = {
  widget_production: 1,
  widget_preview: 0.5,
  cron: 1,
  api: 1,
  whatsapp: 1,
};

export function getChannelBaseUnits(channel: MeteringChannel): number {
  return METERING_CHANNEL_BASE_UNITS[channel] ?? 1;
}

/**
 * Detecta canal desde una petición HTTP de widget chat.
 * Solo clasifica origen — el peso lo resuelve el motor de políticas.
 */
export function detectWidgetMeteringChannel(req: { headers: Headers }): MeteringChannel {
  const explicit = req.headers.get('x-botiva-preview')?.trim().toLowerCase();
  if (explicit === '1' || explicit === 'true' || explicit === 'yes') {
    return 'widget_preview';
  }

  const referer = req.headers.get('referer') ?? '';
  try {
    const path = new URL(referer).pathname;
    if (path.startsWith('/dashboard/widget-preview')) return 'widget_preview';
  } catch {
    if (/\/dashboard\/widget-preview(?:\?|$|\/)/i.test(referer)) return 'widget_preview';
  }

  return 'widget_production';
}
