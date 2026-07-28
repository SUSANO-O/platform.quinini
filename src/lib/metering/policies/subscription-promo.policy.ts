import type { MeteringPolicy, MeteringPolicyPatch } from '../types';

/**
 * Promos y descuentos vía `subscription.features`.
 *
 * Convención de claves (admin / billing):
 * - `promo:conv_weight:0.8`  → cada conversación cuenta 80%
 * - `promo:conv_weight:0`    → no descuenta cupo (campana gratis)
 * - `promo:limit_mult:1.2`   → +20% sobre el límite del plan (cuota.ts puede consumirlo)
 *
 * Mañana podés agregar más políticas sin tocar widget chat ni RequestLog.
 */
const CONV_WEIGHT_RE = /^promo:conv_weight:([0-9]*\.?[0-9]+)$/;
const LIMIT_MULT_RE = /^promo:limit_mult:([0-9]*\.?[0-9]+)$/;

export const subscriptionPromoPolicy: MeteringPolicy = {
  id: 'subscription-promo',
  priority: 200,
  apply(ctx) {
    const features = ctx.subscriptionFeatures;
    if (!features?.length) return null;

    const patch: MeteringPolicyPatch = {};
    let convMult = 1;
    let limitMult = 1;
    let matched = false;

    for (const raw of features) {
      const f = raw.trim();
      if (!f) continue;

      const w = CONV_WEIGHT_RE.exec(f);
      if (w) {
        convMult *= Number(w[1]);
        matched = true;
        continue;
      }

      const l = LIMIT_MULT_RE.exec(f);
      if (l) {
        limitMult *= Number(l[1]);
        matched = true;
      }
    }

    if (!matched) return null;
    if (convMult !== 1) patch.billableUnitsMultiplier = convMult;
    if (limitMult !== 1) patch.limitMultiplier = limitMult;
    return patch;
  },
};
