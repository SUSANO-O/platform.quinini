import { describe, expect, it, vi } from 'vitest';
import { purgeDueAccounts, type PurgeDueAccountsDeps } from '@/modules/account-lifecycle/use-cases/purge-due-accounts.use-case';
import { LIFECYCLE_POLICY_START_SEC, DELETION_AFTER_DAYS } from '@/modules/account-lifecycle/domain/lifecycle';
import { GRACE_PERIOD_DAYS } from '@/lib/subscription-access';
import type { LifecycleCandidate } from '@/modules/account-lifecycle/ports/ILifecycleSubscriptions';
import type { AccountOwnership } from '@/modules/account-lifecycle/ports/IAccountOwnership';

const DAY = 24 * 60 * 60;
const ACCOUNT = 'a'.repeat(24);
const PERIOD_END = LIFECYCLE_POLICY_START_SEC + 10 * DAY;
const SUSPENDED_AT = PERIOD_END + GRACE_PERIOD_DAYS * DAY;
/** Momento en que la cuenta ya cumplió el plazo completo. */
const NOW = new Date((SUSPENDED_AT + DELETION_AFTER_DAYS * DAY + 1) * 1000);

const candidate = (over: Partial<LifecycleCandidate> = {}): LifecycleCandidate => ({
  subscriptionId: 's1', userId: ACCOUNT, email: 'cliente@example.com', displayName: 'Cliente',
  status: 'active', plan: 'team', currentPeriodEnd: PERIOD_END, reminderHistory: [], ...over,
});

const owned: AccountOwnership = {
  accountId: ACCOUNT, agentIds: ['b'.repeat(24)], widgetIds: ['c'.repeat(24)], agentHubIds: ['hub-1'],
};

function build(over: Partial<PurgeDueAccountsDeps> = {}, subs: LifecycleCandidate[] = [candidate()]) {
  const purger = {
    store: 'landing',
    count: vi.fn(async () => ({ WidgetMessage: 10 })),
    purge: vi.fn(async () => ({ WidgetMessage: 10 })),
  };
  const deps: PurgeDueAccountsDeps = {
    subscriptions: {
      listExpired: vi.fn(async () => subs),
      findByUserId: vi.fn(async (id: string) => subs.find((s) => s.userId === id) ?? null),
      recordNotice: vi.fn(async () => {}),
    },
    ownership: { resolve: vi.fn(async () => owned) },
    purgers: [purger],
    exporter: { export: vi.fn(async () => ({ location: 'respaldo://cuenta.json' })) },
    records: { start: vi.fn(async () => 'rec-1'), complete: vi.fn(async () => {}), fail: vi.fn(async () => {}) },
    ledger: { append: vi.fn(async () => {}), listFor: vi.fn(async () => []) },
    notifier: { send: vi.fn(async () => {}) },
    clock: { now: () => NOW },
    enabled: true,
    dryRun: false,
    ...over,
  };
  return { deps, purger };
}

describe('purgeDueAccounts — el interruptor manda', () => {
  it('apagado: no borra nada aunque se pida borrado real', async () => {
    const { deps, purger } = build({ enabled: false, dryRun: false });
    const r = await purgeDueAccounts(deps);
    expect(purger.purge).not.toHaveBeenCalled();
    expect(deps.exporter.export).not.toHaveBeenCalled();
    expect(deps.records.start).not.toHaveBeenCalled();
    expect(r.dryRun).toBe(true);
    expect(r.report[0].outcome).toBe('dry_run');
  });

  it('simulacro: reporta cuánto borraría, sin borrar', async () => {
    const { deps, purger } = build({ dryRun: true });
    const r = await purgeDueAccounts(deps);
    expect(purger.count).toHaveBeenCalled();
    expect(purger.purge).not.toHaveBeenCalled();
    expect(r.report[0].planned).toEqual({ landing: { WidgetMessage: 10 } });
  });
});

describe('purgeDueAccounts — a quién alcanza', () => {
  it('solo borra a quien cumplió el plazo completo', async () => {
    // un día antes del plazo: todavía no
    const casiNOW = new Date((SUSPENDED_AT + (DELETION_AFTER_DAYS - 1) * DAY) * 1000);
    const { deps, purger } = build({ clock: { now: () => casiNOW } });
    const r = await purgeDueAccounts(deps);
    expect(r.due).toBe(0);
    expect(purger.purge).not.toHaveBeenCalled();
  });

  it('si pagó entre que se armó la lista y el borrado, no la borra', async () => {
    const pagada = candidate({ currentPeriodEnd: Math.floor(NOW.getTime() / 1000) + 30 * DAY });
    const { deps, purger } = build({}, [candidate()]);
    deps.subscriptions.findByUserId = vi.fn(async () => pagada);
    const r = await purgeDueAccounts(deps);
    expect(r.report[0].outcome).toBe('skipped_revalidation');
    expect(purger.purge).not.toHaveBeenCalled();
  });
});

describe('purgeDueAccounts — orden y respaldo', () => {
  it('respalda ANTES de borrar', async () => {
    const orden: string[] = [];
    const { deps, purger } = build();
    deps.exporter.export = vi.fn(async () => { orden.push('export'); return { location: 'x' }; });
    purger.purge = vi.fn(async () => { orden.push('purge'); return {}; });
    await purgeDueAccounts(deps);
    expect(orden).toEqual(['export', 'purge']);
  });

  it('si el respaldo falla, NO se borra nada y queda constancia del fallo', async () => {
    const { deps, purger } = build();
    deps.exporter.export = vi.fn(async () => { throw new Error('bucket caído'); });
    const r = await purgeDueAccounts(deps);
    expect(purger.purge).not.toHaveBeenCalled();
    expect(deps.records.fail).toHaveBeenCalledWith('rec-1', 'bucket caído');
    expect(r.report[0].outcome).toBe('failed');
    expect(r.purged).toBe(0);
  });

  it('abre la constancia antes de tocar nada', async () => {
    const orden: string[] = [];
    const { deps, purger } = build();
    deps.records.start = vi.fn(async () => { orden.push('start'); return 'rec-1'; });
    deps.exporter.export = vi.fn(async () => { orden.push('export'); return { location: 'x' }; });
    purger.purge = vi.fn(async () => { orden.push('purge'); return {}; });
    await purgeDueAccounts(deps);
    expect(orden).toEqual(['start', 'export', 'purge']);
  });

  it('purga los almacenes en el orden recibido (el hub antes que la landing)', async () => {
    const orden: string[] = [];
    const hub = { store: 'hub', count: vi.fn(async () => ({})), purge: vi.fn(async () => { orden.push('hub'); return {}; }) };
    const landing = { store: 'landing', count: vi.fn(async () => ({})), purge: vi.fn(async () => { orden.push('landing'); return {}; }) };
    const { deps } = build({ purgers: [hub, landing] });
    await purgeDueAccounts(deps);
    expect(orden).toEqual(['hub', 'landing']);
  });
});

describe('purgeDueAccounts — resultado', () => {
  it('borra, avisa al cliente, registra el aviso y cierra la constancia', async () => {
    const { deps, purger } = build();
    const r = await purgeDueAccounts(deps);
    expect(purger.purge).toHaveBeenCalledWith(owned);
    expect(deps.notifier.send).toHaveBeenCalledWith(
      'cliente@example.com',
      expect.objectContaining({ kind: 'account_deleted' }),
      expect.objectContaining({ plan: 'team' }),
    );
    expect(deps.ledger.append).toHaveBeenCalledWith(expect.objectContaining({ kind: 'account_deleted' }));
    expect(deps.records.complete).toHaveBeenCalledWith('rec-1', {
      purged: { landing: { WidgetMessage: 10 } },
      exportLocation: 'respaldo://cuenta.json',
    });
    expect(r.purged).toBe(1);
    expect(r.report[0].outcome).toBe('purged');
  });

  it('un fallo con una cuenta no arrastra al resto del lote', async () => {
    const otra = candidate({ subscriptionId: 's2', userId: 'd'.repeat(24), email: 'otra@example.com' });
    const { deps, purger } = build({}, [candidate(), otra]);
    deps.ownership.resolve = vi.fn(async (id: string) => {
      if (id === ACCOUNT) throw new Error('no se pudo resolver');
      return { ...owned, accountId: id };
    });
    const r = await purgeDueAccounts(deps);
    expect(r.failed).toBe(1);
    expect(r.purged).toBe(1);
    expect(purger.purge).toHaveBeenCalledTimes(1);
  });
});
