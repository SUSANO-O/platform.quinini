import { getChannelBaseUnits } from '../channel-weights';
import type { MeteringPolicy } from '../types';

/** Fija unidades base según el canal (producción=1, preview=0.5, …). */
export const channelBasePolicy: MeteringPolicy = {
  id: 'channel-base',
  priority: 0,
  apply(ctx) {
    return { billableUnits: getChannelBaseUnits(ctx.channel) };
  },
};
