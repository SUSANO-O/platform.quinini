import { describe, expect, it } from 'vitest';
import {
  resolveLifecycle,
  LIFECYCLE_POLICY_START_SEC,
  PRICING_STAGE_AFTER_DAYS,
  DELETION_WARNING_AFTER_DAYS,
  DELETION_AFTER_DAYS,
} from '@/modules/account-lifecycle/domain/lifecycle';
import { GRACE_PERIOD_DAYS } from '@/lib/subscription';

const DAY = 24 * 60 * 60;
const GRACE = GRACE_PERIOD_DAYS * DAY;

// Caso "nuevo": vence 10 días DESPUÉS del estreno de la política, así la
// cuenta regresiva arranca en su fecha real y no queda recortada al estreno.
const PERIOD_END = LIFECYCLE_POLICY_START_SEC + 10 * DAY;
const SUSPENDED_AT = PERIOD_END + GRACE;
/** Momento que cae `d` días después de perder el acceso. */
const daysAfterSuspension = (d: number) => (SUSPENDED_AT + d * DAY) * 1000;
const lapsed = (extra: Record<string, unknown> = {}) => ({
  status: 'active', plan: 'team', currentPeriodEnd: PERIOD_END, ...extra,
});

describe('resolveLifecycle — tramos', () => {
  it('plan al día → active', () => {
    const r = resolveLifecycle(lapsed(), (PERIOD_END - DAY) * 1000);
    expect(r.stage).toBe('active');
    expect(r.deletionAtSec).toBe(0);
  });

  it('dentro de la cortesía → grace', () => {
    expect(resolveLifecycle(lapsed(), (PERIOD_END + 3 * DAY) * 1000).stage).toBe('grace');
  });

  it('recién suspendida → gris', () => {
    const r = resolveLifecycle(lapsed(), (SUSPENDED_AT + 1) * 1000);
    expect(r.stage).toBe('suspended_recent');
    expect(r.suspendedAtSec).toBe(SUSPENDED_AT);
  });

  // La cortesía es inclusiva (igual que resolveSubscriptionAccess y los avisos
  // de cortesía): el segundo exacto en que termina todavía cuenta como cortesía.
  it('borde exacto de la cortesía: ese segundo es cortesía, el siguiente ya no', () => {
    expect(resolveLifecycle(lapsed(), SUSPENDED_AT * 1000).stage).toBe('grace');
    expect(resolveLifecycle(lapsed(), (SUSPENDED_AT + 1) * 1000).stage).toBe('suspended_recent');
  });

  it('borde 29 → 30 días: gris pasa a precios', () => {
    expect(resolveLifecycle(lapsed(), daysAfterSuspension(PRICING_STAGE_AFTER_DAYS - 1)).stage).toBe('suspended_recent');
    expect(resolveLifecycle(lapsed(), daysAfterSuspension(PRICING_STAGE_AFTER_DAYS)).stage).toBe('suspended_pricing');
  });

  it('borde 89 → 90 días: precios pasa a aviso de borrado', () => {
    expect(resolveLifecycle(lapsed(), daysAfterSuspension(DELETION_WARNING_AFTER_DAYS - 1)).stage).toBe('suspended_pricing');
    expect(resolveLifecycle(lapsed(), daysAfterSuspension(DELETION_WARNING_AFTER_DAYS)).stage).toBe('pending_deletion');
  });

  it('borde 179 → 180 días: recién ahí queda para borrar', () => {
    expect(resolveLifecycle(lapsed(), daysAfterSuspension(DELETION_AFTER_DAYS - 1)).stage).toBe('pending_deletion');
    expect(resolveLifecycle(lapsed(), daysAfterSuspension(DELETION_AFTER_DAYS)).stage).toBe('due_for_deletion');
  });

  it('la fecha de borrado es la misma que se le anuncia en todo el tramo', () => {
    const esperado = SUSPENDED_AT + DELETION_AFTER_DAYS * DAY;
    for (const d of [1, 45, 95, 150, 179]) {
      expect(resolveLifecycle(lapsed(), daysAfterSuspension(d)).deletionAtSec).toBe(esperado);
    }
  });
});

describe('resolveLifecycle — nunca se programa el borrado de lo que no corresponde', () => {
  const muyTarde = daysAfterSuspension(DELETION_AFTER_DAYS + 400);

  it('plan free vencido → no aplica', () => {
    expect(resolveLifecycle(lapsed({ plan: 'free' }), muyTarde).stage).toBe('not_applicable');
  });

  it('cancelación voluntaria → no aplica (irse no es dejar de pagar)', () => {
    expect(resolveLifecycle(lapsed({ status: 'canceled' }), muyTarde).stage).toBe('not_applicable');
  });

  // currentPeriodEnd 0 con plan activo = acceso permanente sin vencimiento (planes
  // asignados a mano). Queda en 'active' — lo que importa es que jamás se borra.
  it('sin fecha de vencimiento → acceso permanente, jamás entra al borrado', () => {
    const r = resolveLifecycle(lapsed({ currentPeriodEnd: 0 }), muyTarde);
    expect(['pending_deletion', 'due_for_deletion']).not.toContain(r.stage);
    expect(r.deletionAtSec).toBe(0);
  });

  it('sin acceso pero SIN haber vencido → no aplica', () => {
    // trial manual: status trialing sin pasarela no da acceso, pero no es falta de pago
    const r = resolveLifecycle(
      { status: 'trialing', plan: 'team', currentPeriodEnd: PERIOD_END },
      (PERIOD_END - 5 * DAY) * 1000,
    );
    expect(r.stage).toBe('not_applicable');
  });

  it('si paga durante el aviso, vuelve a active (el cron revalida antes de borrar)', () => {
    const pagado = lapsed({ currentPeriodEnd: (daysAfterSuspension(170) / 1000) + 30 * DAY });
    expect(resolveLifecycle(pagado, daysAfterSuspension(170)).stage).toBe('active');
  });
});

// "Solo casos nuevos": cuentas vencidas antes del estreno arrancan su cuenta
// regresiva el día del estreno. Caso real: dopihex654 llevaba ~108 días sin
// acceso — sin este recorte habría recibido de golpe "se borra en días".
describe('resolveLifecycle — estreno de la política', () => {
  const vencidaHaceMeses = { status: 'active', plan: 'business', currentPeriodEnd: LIFECYCLE_POLICY_START_SEC - 120 * DAY };

  it('el día del estreno una cuenta vieja arranca en gris, no en borrado', () => {
    const r = resolveLifecycle(vencidaHaceMeses, LIFECYCLE_POLICY_START_SEC * 1000);
    expect(r.stage).toBe('suspended_recent');
    expect(r.suspendedAtSec).toBe(LIFECYCLE_POLICY_START_SEC);
    expect(r.daysSuspended).toBe(0);
  });

  it('su borrado queda a 180 días del estreno, no de su vencimiento real', () => {
    const r = resolveLifecycle(vencidaHaceMeses, LIFECYCLE_POLICY_START_SEC * 1000);
    expect(r.deletionAtSec).toBe(LIFECYCLE_POLICY_START_SEC + DELETION_AFTER_DAYS * DAY);
  });
});
