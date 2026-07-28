/**
 * Medición de conversaciones — capa desacoplada.
 *
 * Flujo:
 * 1. Clasificar canal (`detectWidgetMeteringChannel`)
 * 2. Resolver peso + promos (`resolveConversationMetering`)
 * 3. Persistir en RequestLog (`trackWidgetChatUsage`)
 *
 * Nueva promo mañana:
 * - Agregar clave en `subscription.features` (ej. `promo:conv_weight:0.5`)
 * - O crear `policies/mi-promo.policy.ts` y registrar en `policies/index.ts`
 */

export type {
  MeteringChannel,
  MeteringContext,
  MeteringDecision,
  MeteringPolicy,
  MeteringPolicyPatch,
} from './types';

export {
  METERING_CHANNEL_BASE_UNITS,
  detectWidgetMeteringChannel,
  getChannelBaseUnits,
} from './channel-weights';

export { resolveMetering } from './engine';
export { resolveConversationMetering } from './resolve-conversation-metering';
export { DEFAULT_METERING_POLICIES } from './policies';
export { subscriptionPromoPolicy } from './policies/subscription-promo.policy';
