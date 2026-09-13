/**
 * Identidad visual de una persona o sesión en el panel: el color de su avatar
 * y sus iniciales.
 *
 * Estaba duplicado —paleta incluida, con los mismos hex— entre la tarjeta del
 * inbox y la pantalla de chats, cada una con su propia función de dispersión.
 * Dos copias significan que el mismo visitante podía salir de un color en una
 * pantalla y de otro en la de al lado.
 */

export type AvatarColor = { bg: string; fg: string; border: string };

export const AVATAR_PALETTE: readonly AvatarColor[] = [
  { bg: '#e6f2f4', fg: '#004A57', border: '#a8cdd4' },
  { bg: '#eef2f6', fg: '#475569', border: '#cbd5e1' },
  { bg: '#e6f2f1', fg: '#0f766e', border: '#a7d4cf' },
  { bg: '#edf2f7', fg: '#334155', border: '#c5d0dc' },
] as const;

/** Color estable para una clave: la misma entrada da siempre el mismo color. */
export function paletteFromKey(key: string): AvatarColor {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

/** Iniciales de una etiqueta; `fallback` cuando no hay nada que abreviar. */
export function initialsFrom(label: string, fallback = '?'): string {
  const limpio = label.trim();
  if (!limpio) return fallback;

  const partes = limpio.split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return limpio.slice(0, 2).toUpperCase();
}
