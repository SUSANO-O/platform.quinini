import type { AccessDoc } from '@/lib/subscription-access';

/** Suscripción vencida con los datos de su dueño, candidata a avisos o borrado. */
export type LifecycleCandidate = AccessDoc & {
  subscriptionId: string;
  userId: string;
  email: string;
  displayName: string | null;
  /** Marcas de avisos ya enviados (idempotencia). */
  reminderHistory: string[];
};

/** Lectura de suscripciones y registro de avisos enviados. */
export interface ILifecycleSubscriptions {
  /** Planes de pago vencidos, no cancelados, con dueño no-admin que tenga email. */
  listExpired(nowSec: number): Promise<LifecycleCandidate[]>;
  /** Estado FRESCO de una cuenta — se revalida justo antes de borrar. */
  findByUserId(userId: string): Promise<LifecycleCandidate | null>;
  /** Marca un aviso como enviado (idempotente). */
  recordNotice(subscriptionId: string, mark: string): Promise<void>;
}
