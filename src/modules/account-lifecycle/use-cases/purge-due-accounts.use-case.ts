import { resolveLifecycle } from '../domain/lifecycle';
import { accountDeletedMark } from '../domain/notices';
import type { ILifecycleSubscriptions } from '../ports/ILifecycleSubscriptions';
import type { IAccountOwnership } from '../ports/IAccountOwnership';
import type { IAccountPurger, PurgeCounts } from '../ports/IAccountPurger';
import type { IAccountExporter } from '../ports/IAccountExporter';
import type { IDeletionRecords } from '../ports/IDeletionRecords';
import type { INoticeLedger } from '../ports/INoticeLedger';
import type { ILifecycleNotifier } from '../ports/ILifecycleNotifier';
import type { IClock } from '../ports/IClock';

export interface PurgeDueAccountsDeps {
  subscriptions: ILifecycleSubscriptions;
  ownership: IAccountOwnership;
  /**
   * Almacenes a purgar, EN ORDEN. El hub va primero: necesita los agentes de
   * la landing para saber qué borrar del otro lado.
   */
  purgers: IAccountPurger[];
  exporter: IAccountExporter;
  records: IDeletionRecords;
  ledger: INoticeLedger;
  notifier: ILifecycleNotifier;
  clock: IClock;
  /** Interruptor general. En false NADA se borra, por más que se pida. */
  enabled: boolean;
  /** Simulacro explícito del llamador. */
  dryRun: boolean;
}

export type PurgeOutcome = 'dry_run' | 'purged' | 'skipped_revalidation' | 'failed';

export interface PurgeDueAccountsResult {
  ok: true;
  /** true si no se borró nada: por simulacro o porque el interruptor está apagado. */
  dryRun: boolean;
  enabled: boolean;
  checked: number;
  due: number;
  purged: number;
  failed: number;
  report: Array<{
    userId: string;
    email: string;
    plan: string;
    suspendedAt: string;
    outcome: PurgeOutcome;
    planned?: Record<string, PurgeCounts>;
    deleted?: Record<string, PurgeCounts>;
    exportLocation?: string;
    error?: string;
  }>;
}

/**
 * Borra las cuentas que agotaron el plazo. Irreversible, así que:
 *
 *  - el interruptor `enabled` manda sobre todo: apagado, solo reporta;
 *  - se revalida el estado FRESCO justo antes de borrar (pudo pagar entre que
 *    se armó la lista y este momento);
 *  - se abre la constancia ANTES de borrar, con los ids ya resueltos: si el
 *    proceso se corta, queda registro de qué cuenta quedó a medias;
 *  - si el respaldo falla, no se borra nada;
 *  - un fallo con una cuenta no arrastra al resto del lote.
 */
export async function purgeDueAccounts(deps: PurgeDueAccountsDeps): Promise<PurgeDueAccountsResult> {
  const { subscriptions, ownership, purgers, exporter, records, ledger, notifier, clock, enabled } = deps;
  const dryRun = deps.dryRun || !enabled;
  const now = clock.now();
  const nowMs = now.getTime();

  const candidates = await subscriptions.listExpired(Math.floor(nowMs / 1000));
  const result: PurgeDueAccountsResult = {
    ok: true, dryRun, enabled, checked: candidates.length, due: 0, purged: 0, failed: 0, report: [],
  };

  for (const candidate of candidates) {
    if (resolveLifecycle(candidate, nowMs).stage !== 'due_for_deletion') continue;
    result.due += 1;

    const row: PurgeDueAccountsResult['report'][number] = {
      userId: candidate.userId, email: candidate.email, plan: candidate.plan,
      suspendedAt: '', outcome: 'failed',
    };

    try {
      // Estado fresco: si pagó recién, ya no corresponde borrarla.
      const fresh = await subscriptions.findByUserId(candidate.userId);
      const lifecycle = fresh ? resolveLifecycle(fresh, nowMs) : null;
      if (!fresh || !lifecycle || lifecycle.stage !== 'due_for_deletion') {
        row.outcome = 'skipped_revalidation';
        result.report.push(row);
        continue;
      }
      row.suspendedAt = new Date(lifecycle.suspendedAtSec * 1000).toISOString();

      const owned = await ownership.resolve(candidate.userId);
      const planned: Record<string, PurgeCounts> = {};
      for (const purger of purgers) planned[purger.store] = await purger.count(owned);
      row.planned = planned;

      if (dryRun) {
        row.outcome = 'dry_run';
        result.report.push(row);
        continue;
      }

      const notices = await ledger.listFor(candidate.userId);
      const recordId = await records.start({
        accountId: candidate.userId,
        email: candidate.email,
        plan: candidate.plan,
        suspendedAt: new Date(lifecycle.suspendedAtSec * 1000),
        scheduledFor: new Date(lifecycle.deletionAtSec * 1000),
        owned,
        planned,
        notices,
      });

      try {
        // Respaldo primero: si esto falla, no se borra nada.
        const { location } = await exporter.export(owned);

        const deleted: Record<string, PurgeCounts> = {};
        for (const purger of purgers) deleted[purger.store] = await purger.purge(owned);

        const mark = accountDeletedMark(lifecycle);
        await notifier.send(candidate.email, { kind: 'account_deleted', mark }, { plan: candidate.plan });
        await ledger.append({
          userId: candidate.userId, email: candidate.email, kind: 'account_deleted', mark, sentAt: clock.now(),
        });
        await records.complete(recordId, { purged: deleted, exportLocation: location });

        row.outcome = 'purged';
        row.deleted = deleted;
        row.exportLocation = location;
        result.purged += 1;
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        await records.fail(recordId, error);
        row.outcome = 'failed';
        row.error = error;
        result.failed += 1;
      }
    } catch (e) {
      row.outcome = 'failed';
      row.error = e instanceof Error ? e.message : String(e);
      result.failed += 1;
    }

    result.report.push(row);
  }

  return result;
}
