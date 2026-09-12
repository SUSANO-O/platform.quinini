import type { AccountOwnership } from './IAccountOwnership';

/** Respaldo de los datos de la cuenta, tomado ANTES de borrar. */
export interface IAccountExporter {
  /** Devuelve dónde quedó el respaldo. Si falla, lanza — y no se borra nada. */
  export(owned: AccountOwnership): Promise<{ location: string }>;
}
