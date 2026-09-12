/** Reloj inyectable: los casos de uso no leen la hora del sistema directamente. */
export interface IClock {
  now(): Date;
}
