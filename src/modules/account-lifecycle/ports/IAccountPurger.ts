import type { AccountOwnership } from './IAccountOwnership';

/** Cantidad de registros por modelo o recurso. */
export type PurgeCounts = Record<string, number>;

/**
 * Purga los datos de una cuenta en UN almacén (la base de la landing, el hub...).
 * Agregar un almacén nuevo es agregar un adaptador — el caso de uso no cambia.
 */
export interface IAccountPurger {
  /** Nombre del almacén, para los reportes. */
  readonly store: string;
  /** Cuánto se borraría. Sin efectos: es lo que muestra el simulacro. */
  count(owned: AccountOwnership): Promise<PurgeCounts>;
  /** Borra y devuelve cuánto borró. */
  purge(owned: AccountOwnership): Promise<PurgeCounts>;
}
