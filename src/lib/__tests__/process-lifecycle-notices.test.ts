import { describe, expect, it, vi } from 'vitest';
import { processLifecycleNotices, type ProcessLifecycleNoticesDeps } from '@/modules/account-lifecycle/use-cases/process-lifecycle-notices.use-case';
import { LIFECYCLE_POLICY_START_SEC, DELETION_WARNING_AFTER_DAYS } from '@/modules/account-lifecycle/domain/lifecycle';
import { GRACE_PERIOD_DAYS } from '@/lib/subscription-access';
import type { LifecycleCandidate } from '@/modules/account-lifecycle/ports/ILifecycleSubscriptions';

const DAY = 24 * 60 * 60;
const PERIOD_END = LIFECYCLE_POLICY_START_SEC + 10 * DAY;
const SUSPENDED_AT = PERIOD_END + GRACE_PERIOD_DAYS * DAY;

const candidate = (over: Partial<LifecycleCandidate> = {}): LifecycleCandidate => ({
  subscriptionId: 's1', userId: 'a'.repeat(24), email: 'cliente@example.com', displayName: 'Cliente',
  status: 'active', plan: 'team', currentPeriodEnd: PERIOD_END, reminderHistory: [], ...over,
});

function build(atSec: number, subs: LifecycleCandidate[] = [candidate()], dryRun = false) {
  const deps: ProcessLifecycleNoticesDeps = {
    subscriptions: {
      listExpired: vi.fn(async () => subs),
      findByUserId: vi.fn(async () => null),
      recordNotice: vi.fn(async () => {}),
    },
    notifier: { send: vi.fn(async () => {}) },
    ledger: { append: vi.fn(async () => {}), listFor: vi.fn(async () => []) },
    clock: { now: () => new Date(atSec * 1000) },
    dryRun,
  };
  return deps;
}

describe('processLifecycleNotices', () => {
  it('el día del vencimiento manda el aviso de cortesía', async () => {
    const deps = build(PERIOD_END + 60);
    const r = await processLifecycleNotices(deps);
    expect(r.report[0].kind).toBe('grace');
    expect(deps.notifier.send).toHaveBeenCalledTimes(1);
  });

  it('pasada la cortesía manda el aviso de suspensión', async () => {
    const deps = build(SUSPENDED_AT + DAY);
    const r = await processLifecycleNotices(deps);
    expect(r.report[0].kind).toBe('suspended');
  });

  it('a los 90 días sin acceso arranca el aviso semanal de borrado, con fecha', async () => {
    const deps = build(SUSPENDED_AT + DELETION_WARNING_AFTER_DAYS * DAY + 60,
      [candidate({ reminderHistory: [`suspended:${new Date(PERIOD_END * 1000).toISOString().slice(0, 10)}`] })]);
    const r = await processLifecycleNotices(deps);
    expect(r.report[0].kind).toBe('deletion_warning');
    expect(r.report[0].deletionAt).toBeTruthy();
    expect(r.report[0].daysLeft).toBe(90);
  });

  it('no repite un aviso ya enviado', async () => {
    const iso = new Date(SUSPENDED_AT * 1000).toISOString().slice(0, 10);
    const deps = build(SUSPENDED_AT + DELETION_WARNING_AFTER_DAYS * DAY + 60,
      [candidate({ reminderHistory: [
        `suspended:${new Date(PERIOD_END * 1000).toISOString().slice(0, 10)}`,
        `deletion_warning:0:${iso}`,
      ] })]);
    const r = await processLifecycleNotices(deps);
    expect(r.found).toBe(0);
    expect(deps.notifier.send).not.toHaveBeenCalled();
  });

  it('simulacro: reporta sin enviar ni marcar', async () => {
    const deps = build(PERIOD_END + 60, [candidate()], true);
    const r = await processLifecycleNotices(deps);
    expect(r.found).toBe(1);
    expect(r.sent).toBe(0);
    expect(deps.notifier.send).not.toHaveBeenCalled();
    expect(deps.subscriptions.recordNotice).not.toHaveBeenCalled();
  });

  it('envía, marca y registra — en ese orden', async () => {
    const orden: string[] = [];
    const deps = build(PERIOD_END + 60);
    deps.notifier.send = vi.fn(async () => { orden.push('send'); });
    deps.subscriptions.recordNotice = vi.fn(async () => { orden.push('mark'); });
    deps.ledger.append = vi.fn(async () => { orden.push('ledger'); });
    await processLifecycleNotices(deps);
    expect(orden).toEqual(['send', 'mark', 'ledger']);
  });

  it('si falla el envío a una cuenta, sigue con las demás', async () => {
    const otra = candidate({ subscriptionId: 's2', userId: 'b'.repeat(24), email: 'otra@example.com' });
    const deps = build(PERIOD_END + 60, [candidate(), otra]);
    deps.notifier.send = vi.fn(async (to: string) => {
      if (to === 'cliente@example.com') throw new Error('resend caído');
    });
    const r = await processLifecycleNotices(deps);
    expect(r.failed).toBe(1);
    expect(r.sent).toBe(1);
  });

  it('ignora planes que no son de pago', async () => {
    const deps = build(PERIOD_END + 60, [candidate({ plan: 'free' })]);
    const r = await processLifecycleNotices(deps);
    expect(r.found).toBe(0);
  });
});
