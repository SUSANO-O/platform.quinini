/**
 * Shares duraderos — el requisito para poder instalar un agente como app.
 *
 * Un share normal caduca (8 h por defecto) y Mongo BORRA la fila con un índice
 * TTL. Eso está bien para dar acceso temporal, pero es incompatible con una
 * PWA: instalar algo en la pantalla de inicio promete que mañana sigue ahí, y
 * un icono que abre una contraseña que ya no existe es peor que no tener app.
 *
 * Por eso la instalación solo se ofrece en shares marcados como duraderos.
 * El dueño sigue pudiendo revocarlos desde el panel — lo que se quita es la
 * caducidad automática, no el control.
 *
 * Mecanismo: el índice TTL borra cuando `expiresAt <= ahora`, así que a los
 * duraderos se les pone una fecha tan lejana que nunca llega. Así no hay que
 * tocar el índice ni migrar las filas que ya existen.
 */

/** Fecha centinela: lo bastante lejos como para que el TTL no la alcance nunca. */
export const SHARE_NEVER_EXPIRES = new Date('9999-12-31T23:59:59.999Z');

export type ShareDurationUnit = 'hours' | 'days' | 'weeks' | 'months' | 'never';

const MS_POR_UNIDAD: Record<string, number> = {
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
  months: 2_592_000_000,
};

/** `never` es la única unidad que no cuenta tiempo. */
export function esUnidadDuradera(unit: string): boolean {
  return unit === 'never';
}

/**
 * Fecha de caducidad de un share. Idéntica a la de siempre para las unidades
 * que ya existían; `never` devuelve el centinela.
 */
export function shareExpiresAt(value: number, unit: ShareDurationUnit): Date {
  if (esUnidadDuradera(unit)) return new Date(SHARE_NEVER_EXPIRES);
  const ms = MS_POR_UNIDAD[unit] ?? MS_POR_UNIDAD.hours;
  return new Date(Date.now() + value * ms);
}

/**
 * ¿Se puede instalar este share como app?
 *
 * Hacen falta las tres: que sea duradero, que siga activo y que no esté
 * caducado. Un share revocado no debe poder instalarse aunque fuera duradero.
 */
export function esInstalable(share: {
  permanent?: boolean;
  active?: boolean;
  expiresAt?: Date | string | null;
}): boolean {
  if (!share.permanent || !share.active) return false;
  if (!share.expiresAt) return false;
  const t = new Date(share.expiresAt).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

/**
 * Nombre corto para la app instalada. Los lanzadores recortan sobre los ~12
 * caracteres, asi que se corta por palabra: "Asesor de Ve" debajo de un icono
 * se lee como un error, "Asesor de" no.
 */
export function nombreCortoApp(nombre: string): string {
  const limpio = (nombre || '').trim().replace(/\s+/g, ' ');
  if (!limpio) return 'Agente';
  if (limpio.length <= 12) return limpio;
  const corte = limpio.slice(0, 12);
  const ultimoEspacio = corte.lastIndexOf(' ');
  // Si la primera palabra ya pasa de 12, no queda mas remedio que partirla.
  return ultimoEspacio > 0 ? corte.slice(0, ultimoEspacio) : corte;
}
