import type { MeteringPolicy } from '../types';
import { channelBasePolicy } from './channel-base.policy';
import { subscriptionPromoPolicy } from './subscription-promo.policy';

/** Políticas por defecto — registrar nuevas aquí o inyectar en tests. */
export const DEFAULT_METERING_POLICIES: MeteringPolicy[] = [
  channelBasePolicy,
  subscriptionPromoPolicy,
];
