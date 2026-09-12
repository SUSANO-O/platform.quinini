import type { AccountOwnership } from './IAccountOwnership';
import type { PurgeCounts } from './IAccountPurger';
import type { LedgerEntry } from './INoticeLedger';

export type DeletionRecordStart = {
  accountId: string;
  email: string;
  plan: string;
  suspendedAt: Date;
  scheduledFor: Date;
  owned: AccountOwnership;
  /** Lo que se iba a borrar, por almacén. */
  planned: Record<string, PurgeCounts>;
  /** Copia de los avisos enviados: queda con el registro aunque cambie el ledger. */
  notices: LedgerEntry[];
};

/**
 * Constancia permanente de cada borrado (no se purga nunca). Se abre ANTES de
 * borrar con los ids ya resueltos: si el proceso se corta a mitad, queda
 * registro de qué cuenta quedó a medio borrar y con qué ids retomarla.
 */
export interface IDeletionRecords {
  start(record: DeletionRecordStart): Promise<string>;
  complete(recordId: string, result: { purged: Record<string, PurgeCounts>; exportLocation: string }): Promise<void>;
  fail(recordId: string, error: string): Promise<void>;
}
