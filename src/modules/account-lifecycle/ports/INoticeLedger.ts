import type { NoticeKind } from '../domain/notices';

export type LedgerEntry = {
  userId: string;
  email: string;
  kind: NoticeKind;
  mark: string;
  sentAt: Date;
};

/**
 * Registro permanente de los avisos enviados. A diferencia de las marcas en la
 * suscripción (que son estado y se borran con la cuenta), esto SOBREVIVE al
 * borrado: es la prueba de que al cliente se le avisó antes de eliminarlo.
 */
export interface INoticeLedger {
  append(entry: LedgerEntry): Promise<void>;
  listFor(userId: string): Promise<LedgerEntry[]>;
}
