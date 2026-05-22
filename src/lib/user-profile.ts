/** Tamaño máximo del archivo de avatar (600 KB). */
export const USER_AVATAR_MAX_FILE_BYTES = 600 * 1024;

/** Longitud máxima del data URL (base64 + prefijo `data:image/...;base64,`). */
export const USER_AVATAR_MAX_DATA_URL_LENGTH =
  Math.ceil(USER_AVATAR_MAX_FILE_BYTES * 4 / 3) + 48;

/** Valida y normaliza URL de avatar de usuario (https o data:image). */
export function normalizeUserAvatarUrl(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') {
    throw new Error('Formato de imagen inválido.');
  }
  const value = raw.trim();
  if (value.startsWith('https://') || value.startsWith('http://')) {
    if (value.length > 2048) throw new Error('La URL es demasiado larga.');
    return value;
  }
  if (value.startsWith('data:image/')) {
    if (value.length > USER_AVATAR_MAX_DATA_URL_LENGTH) {
      throw new Error('La imagen es demasiado grande (máx. 600 KB).');
    }
    return value;
  }
  throw new Error('Usa una URL https o sube una imagen desde tu dispositivo.');
}

export function userInitials(displayName: string | null | undefined, email: string) {
  const src = displayName?.trim() || email;
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
