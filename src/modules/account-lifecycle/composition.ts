/**
 * Único lugar donde se conectan casos de uso con infraestructura. Cambiar un
 * almacén, un proveedor de correo o el orden de purga se hace acá; los casos de
 * uso no se enteran.
 */
import { processLifecycleNotices, type ProcessLifecycleNoticesResult } from './use-cases/process-lifecycle-notices.use-case';
import { purgeDueAccounts, type PurgeDueAccountsResult } from './use-cases/purge-due-accounts.use-case';
import { systemClock } from './infrastructure/system-clock';
import { mongoLifecycleSubscriptions } from './infrastructure/mongo-lifecycle-subscriptions';
import { mongoNoticeLedger } from './infrastructure/mongo-notice-ledger';
import { mongoAccountOwnership } from './infrastructure/mongo-account-ownership';
import { mongoAccountPurger, modelFor } from './infrastructure/mongo-account-purger';
import { hubAccountPurger } from './infrastructure/hub-account-purger';
import { createMongoAccountExporter } from './infrastructure/mongo-account-exporter';
import { mongoDeletionRecords } from './infrastructure/mongo-deletion-records';
import { emailLifecycleNotifier } from './infrastructure/email-lifecycle-notifier';

/**
 * Interruptor del borrado real. Apagado por defecto: mientras no se encienda
 * a propósito, el cron solo reporta qué borraría.
 */
export function isAccountPurgeEnabled(): boolean {
  return process.env.ACCOUNT_PURGE_ENABLED?.trim() === 'true';
}

/** Avisos del ciclo de vida (cortesía, suspensión, aviso semanal de borrado). */
export function runLifecycleNotices(opts: { dryRun: boolean }): Promise<ProcessLifecycleNoticesResult> {
  return processLifecycleNotices({
    subscriptions: mongoLifecycleSubscriptions,
    notifier: emailLifecycleNotifier,
    ledger: mongoNoticeLedger,
    clock: systemClock,
    dryRun: opts.dryRun,
  });
}

/** Borrado de las cuentas que agotaron el plazo. */
export function runAccountPurge(opts: { dryRun: boolean }): Promise<PurgeDueAccountsResult> {
  return purgeDueAccounts({
    subscriptions: mongoLifecycleSubscriptions,
    ownership: mongoAccountOwnership,
    // El hub primero: necesita los agentes de la landing para saber qué borrar.
    purgers: [hubAccountPurger, mongoAccountPurger],
    exporter: createMongoAccountExporter(modelFor),
    records: mongoDeletionRecords,
    ledger: mongoNoticeLedger,
    notifier: emailLifecycleNotifier,
    clock: systemClock,
    enabled: isAccountPurgeEnabled(),
    dryRun: opts.dryRun,
  });
}
